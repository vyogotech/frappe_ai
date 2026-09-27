import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const g = globalThis as Record<string, unknown>;

const SETTINGS = { enabled: true, sidebar_width: 380, keyboard_shortcut: "Alt+/", timeout: 120 };

type Chunk = Record<string, unknown>;

/** A mounted ChatSidebar over stubbed frappe.call and realtime, plus a way to push chunks at it. */
async function setup() {
	const stub = g.frappe as Record<string, unknown>;
	const handlers: ((chunk: Chunk) => void)[] = [];
	g.frappe = {
		...stub,
		boot: { ...(stub.boot as Record<string, unknown>), frappe_ai: SETTINGS },
		call: vi.fn((opts: Record<string, unknown>) => {
			if (opts.method === "frappe_ai.api.chat.start_stream") {
				const args = opts.args as { session_id: string };
				return Promise.resolve({ message: { session_id: args.session_id } });
			}
			return Promise.resolve({ message: { session_id: null, messages: [] } });
		}),
		realtime: {
			on: vi.fn((_event: string, handler: (chunk: Chunk) => void) => {
				handlers.push(handler);
			}),
			off: vi.fn(),
		},
	};

	vi.resetModules(); // each case needs its own useChat() state, and the module caches nothing else
	const { default: ChatSidebar } = await import("./ChatSidebar.vue");
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const wrapper = mount(ChatSidebar as any, {
		props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
	});
	await flushPromises();

	const status = () => wrapper.find("[role='status']");
	/** Ask a question the way a user does, so the component's own useChat() state is the one driven. */
	const ask = async () => {
		await wrapper.find(".frappe-ai-textarea").setValue("how many open invoices?");
		await wrapper.find(".frappe-ai-send-btn").trigger("click");
		await flushPromises();
	};
	const push = async (chunk: Chunk) => {
		handlers[handlers.length - 1](chunk);
		await flushPromises();
	};
	return { wrapper, status, ask, push };
}

describe("the sidebar's status region", () => {
	let originalFrappe: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
	});

	it("is mounted and silent before anything happens", async () => {
		const { status } = await setup();
		expect(status().exists()).toBe(true);
		// visually hidden: bootstrap 4's .sr-only, which frappe's desk bundle compiles in
		expect(status().classes()).toContain("sr-only");
		expect(status().text()).toBe("");
	});

	it("says the assistant is working while a turn is in flight", async () => {
		const { status, ask, push } = await setup();
		await ask();
		expect(status().text()).toBe("Thinking...");
		await push({ type: "done" });
	});

	it("does not read the answer out token by token", async () => {
		const { status, ask, push } = await setup();
		await ask();
		await push({ type: "content", text: "Four" });
		expect(status().text()).toBe("Thinking...");
		await push({ type: "content", text: " invoices." });
		expect(status().text()).toBe("Thinking...");
		await push({ type: "done" });
		expect(status().text()).toBe("Four invoices.");
	});

	it("announces a failure in the words the error bubble shows", async () => {
		const { wrapper, status, ask, push } = await setup();
		await ask();
		await push({ type: "error", message: "The assistant is unreachable." });
		expect(status().text()).toContain("The assistant is unreachable.");
		expect(wrapper.find(".frappe-ai-error-message").text()).toBe(
			"The assistant is unreachable.",
		);
	});

	it("stays silent when the last chat is restored on mount", async () => {
		const stub = g.frappe as Record<string, unknown>;
		g.frappe = {
			...stub,
			boot: { ...(stub.boot as Record<string, unknown>), frappe_ai: SETTINGS },
			call: vi.fn((opts: Record<string, unknown>) => {
				// get_recent_messages answers through `callback`, not the promise
				const message = {
					session_id: "s1",
					messages: [
						{ id: "1", role: "user", content: "how many open invoices?" },
						{ id: "2", role: "assistant", content: "Four invoices." },
					],
				};
				(opts.callback as (r: unknown) => void)({ message });
				return Promise.resolve({ message });
			}),
			realtime: { on: vi.fn(), off: vi.fn() },
		};
		vi.resetModules();
		const { default: ChatSidebar } = await import("./ChatSidebar.vue");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const wrapper = mount(ChatSidebar as any, {
			props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
		});
		await flushPromises();
		expect(wrapper.text()).toContain("Four invoices.");
		expect(wrapper.find("[role='status']").text()).toBe("");
	});

	it("keeps the pending dots out of the accessibility tree", async () => {
		const { wrapper, ask, push } = await setup();
		await ask();
		expect(wrapper.find(".frappe-ai-bubble-status").attributes("aria-hidden")).toBe("true");
		await push({ type: "done" });
	});
});
