import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { decideBoot } from "../utils/boot-decision";

const g = globalThis as Record<string, unknown>;

/** Load the settings over this frappe.call, then hand back the composable and the sidebar that share it. */
async function boot(call: (opts: Record<string, unknown>) => Promise<unknown>) {
	g.frappe = { ...(g.frappe as Record<string, unknown>), call: vi.fn(call) };
	vi.resetModules(); // the composables are module-level singletons, and the sidebar must import the same ones
	const { useSettings } = await import("./useSettings");
	const settings = useSettings();
	await settings.loadSettings();
	const { default: ChatSidebar } = await import("../components/ChatSidebar.vue");
	return { settings, ChatSidebar };
}

const failingCall = () => Promise.reject(new Error("network"));

describe("settings that did not load", () => {
	let originalFrappe: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
	});

	it("is a load failure, not a disabled app", async () => {
		const { settings } = await boot(failingCall);
		expect(settings.loadError.value).toBe(true);
		expect(settings.settings.value.enabled).toBe(false);
	});

	it("mounts the sidebar instead of the disabled hint", () => {
		expect(decideBoot({ enabled: false, roles: ["All"], loadError: true })).toBe(
			"mount-sidebar",
		);
		expect(decideBoot({ enabled: false, roles: ["System Manager"], loadError: true })).toBe(
			"mount-sidebar",
		);
		expect(decideBoot({ enabled: false, roles: ["System Manager"] })).toBe(
			"show-disabled-hint",
		);
	});

	it("says so in the thread", async () => {
		const { ChatSidebar } = await boot(failingCall);
		const wrapper = mount(ChatSidebar, {
			props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
		});
		await flushPromises();
		expect(wrapper.text()).toContain("Connection failed");
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
		const { ChatSidebar } = await boot((opts) => {
			if (opts.method === "frappe_ai.api.get_settings") {
				return Promise.resolve({ message: { enabled: true } });
			}
			// frappe.call reports a failure to its `error` handler, not through the promise
			(opts.error as (err: unknown) => void)(new Error("network"));
			return Promise.resolve({});
		});
		const wrapper = mount(ChatSidebar, {
			props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
		});
		await flushPromises();
		expect(wrapper.text()).toContain("Failed to load chat");
	});
});
