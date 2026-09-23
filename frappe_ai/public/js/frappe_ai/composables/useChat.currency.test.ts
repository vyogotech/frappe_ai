import { afterEach, describe, expect, it, vi } from "vitest";

const g = globalThis as Record<string, unknown>;

/** useChat over a frappe.call that answers start_stream the way the server does, currency and all. */
async function setup(currency: string) {
	const listeners: Array<(data: unknown) => void> = [];
	g.frappe = {
		call: vi.fn((opts: Record<string, unknown>) => {
			if (opts.method === "frappe_ai.api.chat.start_stream") {
				const args = opts.args as { session_id: string };
				const message = { session_id: args.session_id, currency };
				(opts.callback as ((r: { message: unknown }) => void) | undefined)?.({ message });
				return Promise.resolve({ message });
			}
			return Promise.resolve({ message: { session_id: null, messages: [] } });
		}),
		realtime: {
			on: vi.fn((_event: string, handler: (data: unknown) => void) =>
				listeners.push(handler),
			),
			off: vi.fn(),
		},
		boot: { sysdefaults: { currency: "INR" } },
	};

	vi.resetModules();
	const { useChat } = await import("./useChat");
	const { formatValue, setAgentCurrency } = await import("../utils/formatters");
	return { chat: useChat(), listeners, formatValue, setAgentCurrency };
}

describe("useChat currency", () => {
	afterEach(async () => {
		const { setAgentCurrency } = await import("../utils/formatters");
		setAgentCurrency("");
	});

	it("formats the answer's amounts in the currency the server sent to the agent", async () => {
		const { chat, listeners, formatValue } = await setup("USD");
		const promise = chat.sendMessage("what did we sell last month?");
		listeners[listeners.length - 1]({ type: "done", tools_called: [] });
		await promise;
		// the site-wide default in frappe.boot.sysdefaults is INR; the answer is in the company's currency
		expect(formatValue(1234, "currency")).toMatch(/\$/);
	});

	it("leaves the site default in place when the server could not name a currency", async () => {
		const { chat, listeners, formatValue } = await setup("");
		const promise = chat.sendMessage("what did we sell last month?");
		listeners[listeners.length - 1]({ type: "done", tools_called: [] });
		await promise;
		expect(formatValue(1234, "currency")).toMatch(/₹|INR/);
	});
});
