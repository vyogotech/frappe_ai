import { expect, it, vi } from "vitest";

// when the sidebar gives up waiting, the worker must stop too, or it goes on calling tools for nobody
it("asks the server to stop the stream when the sidebar times out", async () => {
	vi.useFakeTimers();
	const call = vi.fn(() => new Promise(() => {}));
	(globalThis as Record<string, unknown>).frappe = {
		csrf_token: "t",
		call,
		realtime: { on: vi.fn(), off: vi.fn() },
	};
	const { useChat } = await import("./useChat");

	void useChat().sendMessage("hi");
	await vi.advanceTimersByTimeAsync(151_000);

	expect(call).toHaveBeenCalledWith(
		expect.objectContaining({ method: "frappe_ai.api.chat.cancel_stream" }),
	);
	vi.useRealTimers();
});
