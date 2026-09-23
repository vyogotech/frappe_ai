import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const g = globalThis as Record<string, unknown>;

const SETTINGS = { enabled: true, sidebar_width: 380, keyboard_shortcut: "Alt+/", timeout: 120 };

/** A mounted ChatSidebar in a document that also holds the button the desk opens it from. */
async function setup() {
	const stub = g.frappe as Record<string, unknown>;
	g.frappe = {
		...stub,
		boot: { ...(stub.boot as Record<string, unknown>), frappe_ai: SETTINGS },
		call: vi.fn(() => Promise.resolve({ message: { session_id: null, messages: [] } })),
		realtime: { on: vi.fn(), off: vi.fn() },
	};

	const opener = document.createElement("button");
	opener.id = "frappe-ai-nav-btn";
	document.body.appendChild(opener);
	opener.focus();

	vi.resetModules();
	const { default: ChatSidebar } = await import("./ChatSidebar.vue");
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const wrapper = mount(ChatSidebar as any, {
		props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
		attachTo: document.body,
	});
	await flushPromises();

	const panel = () => wrapper.find(".frappe-ai-sidebar");
	const open = async () => {
		document.dispatchEvent(new CustomEvent("frappe-ai-opened"));
		await flushPromises();
	};
	return { wrapper, opener, panel, open };
}

describe("where focus goes when the panel opens and closes", () => {
	let originalFrappe: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
		document.body.innerHTML = "";
	});

	it("moves focus into the panel when it opens", async () => {
		const { wrapper, open } = await setup();
		await open();
		// the composer, which is what a reader opens the panel to use, and the one control
		// whose focused look the design already has
		expect(document.activeElement).toBe(wrapper.find(".frappe-ai-textarea").element);
		wrapper.unmount();
	});

	it("gives focus back to whatever opened it", async () => {
		const { wrapper, opener, panel, open } = await setup();
		await open();
		// the user has walked into the panel and pressed Close, so focus is standing on the
		// element that is about to be hidden
		const close = wrapper.findAll(".frappe-ai-icon-btn")[1];
		(close.element as HTMLButtonElement).focus();
		expect(panel().element.contains(document.activeElement)).toBe(true);

		document.dispatchEvent(new CustomEvent("frappe-ai-closed"));
		await flushPromises();
		expect(document.activeElement).toBe(opener);
		wrapper.unmount();
	});

	it("does not pull focus into a panel that closed again in the same tick", async () => {
		const { wrapper, opener } = await setup();
		document.dispatchEvent(new CustomEvent("frappe-ai-opened"));
		document.dispatchEvent(new CustomEvent("frappe-ai-closed"));
		await flushPromises();
		expect(document.activeElement).toBe(opener);
		wrapper.unmount();
	});

	it("closes on Escape from inside the panel", async () => {
		const { wrapper, panel, open } = await setup();
		await open();
		await panel().trigger("keydown", { key: "Escape" });
		expect(wrapper.emitted("close")).toHaveLength(1);
		wrapper.unmount();
	});

	it("leaves other keys alone", async () => {
		const { wrapper, panel, open } = await setup();
		await open();
		await panel().trigger("keydown", { key: "Enter" });
		expect(wrapper.emitted("close")).toBeUndefined();
		wrapper.unmount();
	});

	it("leaves focus alone when the user has already moved it into the page", async () => {
		const { wrapper, opener, open } = await setup();
		await open();
		const elsewhere = document.createElement("input");
		document.body.appendChild(elsewhere);
		elsewhere.focus();
		document.dispatchEvent(new CustomEvent("frappe-ai-closed"));
		await flushPromises();
		expect(document.activeElement).toBe(elsewhere);
		expect(document.activeElement).not.toBe(opener);
		wrapper.unmount();
	});
});
