import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const g = globalThis as Record<string, unknown>;

interface Listener {
	event: string;
	handler: (data: unknown) => void;
}

/** useChat over a stubbed frappe whose AI Assistant Settings answers with this timeout. */
async function setup(timeoutSeconds: number) {
	const listeners: Listener[] = [];
	const methods: string[] = [];
	g.frappe = {
		call: vi.fn((opts: Record<string, unknown>) => {
			methods.push(opts.method as string);
			if (opts.method === "frappe_ai.api.get_settings") {
				return Promise.resolve({ message: { enabled: true, timeout: timeoutSeconds } });
			}
			return Promise.resolve({ message: { session_id: "s-1" } });
		}),
		realtime: {
			on: vi.fn((event: string, handler: (data: unknown) => void) => {
				listeners.push({ event, handler });
			}),
			off: vi.fn(),
		},
	};
	vi.resetModules(); // both composables are module-level singletons
	const { useSettings } = await import("./useSettings");
	await useSettings().loadSettings();
	const { useChat } = await import("./useChat");
	return { chat: useChat(), listeners, methods };
}

function fireChunk(listeners: Listener[], chunk: Record<string, unknown>) {
	listeners[listeners.length - 1].handler(chunk);
}

describe("the sidebar's silence window", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("restarts on every chunk, so a reply that is still streaming is not cut off", async () => {
		const { chat, listeners, methods } = await setup(120);
		const sending = chat.sendMessage("a long answer");

		for (let i = 0; i < 4; i++) {
			await vi.advanceTimersByTimeAsync(100_000);
			fireChunk(listeners, { type: "content", text: "word " });
		}

		expect(methods).not.toContain("frappe_ai.api.chat.cancel_stream");
		expect(chat.messages.value.some((m) => m.role === "error")).toBe(false);

		fireChunk(listeners, { type: "done" });
		await sending;
	});

	it("follows a timeout above 120 s, then stops the worker", async () => {
		const { chat, listeners, methods } = await setup(300);
		const sending = chat.sendMessage("hang");

		await vi.advanceTimersByTimeAsync(121_000);
		expect(chat.messages.value.some((m) => m.role === "error")).toBe(false);

		// past the relay's own budget plus the worker's buffer: 300 + 30
		await vi.advanceTimersByTimeAsync(210_000);
		await sending;

		expect(methods).toContain("frappe_ai.api.chat.cancel_stream");
		expect(chat.messages.value.find((m) => m.role === "error")?.error?.message).toMatch(
			/timed out/i,
		);
		expect(listeners.length).toBeGreaterThan(0);
	});
});
