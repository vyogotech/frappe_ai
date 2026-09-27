/** ADR-006: the pause arrives as a chunk, and the answer leaves as one whitelisted POST. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, ToolCallMessage } from "../types/messages";

const g = globalThis as Record<string, unknown>;

interface CapturedListener {
	event: string;
	handler: (data: unknown) => void;
}

interface CallOpts {
	method: string;
	args?: Record<string, unknown>;
	callback?: (r: { message?: unknown }) => void;
	error?: (err: unknown) => void;
}

async function setup() {
	const order: string[] = [];
	const listeners: CapturedListener[] = [];
	const calls: CallOpts[] = [];
	// set by a test that wants the server to refuse the click
	const refusal: { message: string | null } = { message: null };

	g.frappe = {
		call: vi.fn((opts: CallOpts) => {
			order.push(`call:${opts.method}`);
			calls.push(opts);
			if (opts.method === "frappe_ai.api.confirm.respond") {
				if (refusal.message) opts.error?.({ message: refusal.message });
				else opts.callback?.({ message: { ok: true } });
				return Promise.resolve({ message: { ok: true } });
			}
			if (opts.method === "frappe_ai.api.chat.start_stream") {
				opts.callback?.({ message: { session_id: opts.args?.session_id, currency: "" } });
				return Promise.resolve({ message: { session_id: opts.args?.session_id } });
			}
			return Promise.resolve({ message: { session_id: null, messages: [] } });
		}),
		realtime: {
			on: vi.fn((event: string, handler: (data: unknown) => void) => {
				order.push(`on:${event}`);
				listeners.push({ event, handler });
			}),
			off: vi.fn(),
		},
	};

	vi.resetModules();
	const { useChat } = await import("./useChat");
	return { chat: useChat(), order, listeners, calls, refusal };
}

function fire(listeners: CapturedListener[], chunk: Record<string, unknown>) {
	const last = listeners[listeners.length - 1];
	expect(last).toBeDefined();
	last.handler(chunk);
}

const PENDING = {
	type: "tool_confirm",
	id: "cafe1234",
	name: "create_document",
	arguments: { doctype: "ToDo", description: "pay the invoice" },
};

function card(messages: readonly Message[]): ToolCallMessage {
	const m = messages.find((x) => x.role === "tool_call");
	if (!m || m.role !== "tool_call") throw new Error("no tool card in the thread");
	return m;
}

/** Ask, get the pause, and stop there — the state every test below starts from. */
async function paused() {
	const s = await setup();
	const turn = s.chat.sendMessage("create a todo to pay the invoice");
	fire(s.listeners, { type: "content", text: "Create a new ToDo record." });
	fire(s.listeners, PENDING);
	fire(s.listeners, { type: "done", tools_called: [] });
	await turn;
	return s;
}

describe("useChat, a write waiting on the user", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("turns tool_confirm into a card that carries the id and waits", async () => {
		const { chat } = await paused();
		expect(card(chat.messages.value).toolCall).toMatchObject({
			name: "create_document",
			status: "waiting",
			confirm: { id: "cafe1234" },
			arguments: { doctype: "ToDo" },
		});
	});

	it("posts Deny and asks the agent for nothing", async () => {
		const { chat, calls } = await paused();
		await chat.deny("cafe1234");
		expect(calls.at(-1)).toMatchObject({
			method: "frappe_ai.api.confirm.respond",
			args: { confirmation_id: "cafe1234", decision: "deny" },
		});
		expect(calls.some((c) => c.method === "frappe_ai.api.chat.start_stream")).toBe(true);
		expect(calls.filter((c) => c.method === "frappe_ai.api.chat.start_stream")).toHaveLength(
			1,
		);
		expect(card(chat.messages.value).toolCall.status).toBe("cancelled");
	});

	it("listens before it posts Allow, and the answer arrives with no question of the user's", async () => {
		const { chat, order, listeners, calls } = await paused();
		const before = chat.messages.value.filter((m) => m.role === "user").length;

		const turn = chat.allow("cafe1234");
		expect(order.at(-2)).toMatch(/^on:frappe_ai:chunk:/);
		expect(order.at(-1)).toBe("call:frappe_ai.api.confirm.respond");
		fire(listeners, { type: "content", text: "Done — ToDo TOD-0001 is created." });
		fire(listeners, { type: "done", tools_called: ["create_document"] });
		await turn;

		expect(calls.at(-1)?.args).toEqual({ confirmation_id: "cafe1234", decision: "allow" });
		expect(chat.messages.value.filter((m) => m.role === "user")).toHaveLength(before);
		expect(chat.messages.value.at(-1)).toMatchObject({
			role: "assistant",
			content: "Done — ToDo TOD-0001 is created.",
		});
		expect(card(chat.messages.value).toolCall.status).not.toBe("waiting");
	});

	it("shows the server's line when the click is too late, and leaves the card answerable", async () => {
		const { chat, refusal } = await paused();
		refusal.message = "This request expired. Ask again to run it.";
		await chat.allow("cafe1234");
		expect(chat.messages.value.at(-1)).toMatchObject({
			role: "error",
			content: "This request expired. Ask again to run it.",
		});
		expect(card(chat.messages.value).toolCall.status).toBe("waiting");
	});
});
