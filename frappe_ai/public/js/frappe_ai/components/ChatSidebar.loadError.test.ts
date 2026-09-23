import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const g = globalThis as Record<string, unknown>;

/** Boot the desk with this frappe_ai payload and this frappe.call, then hand back the sidebar. */
async function boot(
	frappe_ai: unknown,
	call: (opts: Record<string, unknown>) => Promise<unknown>,
) {
	const stub = g.frappe as Record<string, unknown>;
	g.frappe = {
		...stub,
		boot: { ...(stub.boot as Record<string, unknown>), frappe_ai },
		call: vi.fn(call),
	};
	vi.resetModules(); // useChat is a module-level singleton, and each case needs its own message list
	const { default: ChatSidebar } = await import("./ChatSidebar.vue");
	return ChatSidebar;
}

const SETTINGS = { enabled: true, sidebar_width: 380, keyboard_shortcut: "Alt+/", timeout: 120 };

const failingCall = (opts: Record<string, unknown>) => {
	// frappe.call reports a failure to its `error` handler, not through the promise
	(opts.error as (err: unknown) => void)(new Error("network"));
	return Promise.resolve({});
};

async function render(ChatSidebar: unknown) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const wrapper = mount(ChatSidebar as any, {
		props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
	});
	await flushPromises();
	return wrapper;
}

describe("a desk boot that carried no settings", () => {
	let originalFrappe: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
	});

	it("says so in the thread instead of reading as AI switched off", async () => {
		const ChatSidebar = await boot(undefined, () => Promise.resolve({ message: [] }));
		expect((await render(ChatSidebar)).text()).toContain("Connection failed");
	});

	it("stays quiet when the boot did carry them", async () => {
		const ChatSidebar = await boot(SETTINGS, () => Promise.resolve({ message: [] }));
		expect((await render(ChatSidebar)).text()).not.toContain("Connection failed");
	});
});

describe("a chat history that did not load", () => {
	let originalFrappe: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
	});

	it("says so instead of showing an empty chat", async () => {
		const ChatSidebar = await boot(SETTINGS, failingCall);
		expect((await render(ChatSidebar)).text()).toContain("Failed to load chat");
	});
});
