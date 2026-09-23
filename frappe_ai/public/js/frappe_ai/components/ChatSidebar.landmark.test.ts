import { describe, expect, it } from "vitest";
import { shallowMount } from "@vue/test-utils";
import ChatSidebar from "./ChatSidebar.vue";

describe("ChatSidebar landmark", () => {
	it("is a landmark a screen reader can jump to, with a name", () => {
		const wrapper = shallowMount(ChatSidebar, {
			props: { sidebarWidth: 380, keyboardShortcut: "Ctrl+K" },
		});
		const root = wrapper.find(".frappe-ai-sidebar");
		expect(root.exists()).toBe(true);
		expect(root.element.tagName).toBe("ASIDE");
		expect(root.attributes("aria-label")).toBe("Frappe AI");
	});
});
