import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ChatMessages from "./ChatMessages.vue";
import type { Message } from "../types/messages";

const stubs = {
	MessageBubble: { props: ["message"], template: '<div class="stub-bubble" />' },
	ToolCallCard: { props: ["toolCall"], template: '<div class="stub-toolcard" />' },
};

function hydratedChat(n: number): Message[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `m-${i}`,
		role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
		content: `msg-${i}`,
		timestamp: null,
	}));
}

describe("ChatMessages scroll position", () => {
	// The sidebar hydrates on mount, while its root is still hidden: there scrollHeight is 0, so the
	// message watcher's scroll does nothing and the panel opens on the oldest message of the window.
	it("scrolls to the newest message when the sidebar is opened", async () => {
		const wrapper = mount(ChatMessages, {
			props: { messages: hydratedChat(50) },
			global: { stubs },
		});
		const container = wrapper.find(".frappe-ai-messages").element as HTMLElement;
		Object.defineProperty(container, "scrollHeight", { value: 4200, configurable: true });
		expect(container.scrollTop).toBe(0);

		document.dispatchEvent(new CustomEvent("frappe-ai-opened"));
		await nextTick();

		expect(container.scrollTop).toBe(4200);
		wrapper.unmount();
	});

	it("stops scrolling on open once unmounted", async () => {
		const wrapper = mount(ChatMessages, {
			props: { messages: hydratedChat(3) },
			global: { stubs },
		});
		const container = wrapper.find(".frappe-ai-messages").element as HTMLElement;
		Object.defineProperty(container, "scrollHeight", { value: 300, configurable: true });
		wrapper.unmount();

		document.dispatchEvent(new CustomEvent("frappe-ai-opened"));
		await nextTick();

		expect(container.scrollTop).toBe(0);
	});
});
