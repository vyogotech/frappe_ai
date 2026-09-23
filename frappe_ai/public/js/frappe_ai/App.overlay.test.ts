import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import App from "./App.vue";

const SidebarStub = defineComponent({
	name: "ChatSidebar",
	props: {
		sidebarWidth: { type: Number, required: true },
		keyboardShortcut: { type: String, required: true },
	},
	emits: ["close"],
	template: '<div class="stub-sidebar" />',
});

function open() {
	const wrapper = mount(App, {
		props: { sidebarWidth: 380, keyboardShortcut: "Alt+/" },
		global: { stubs: { ChatSidebar: SidebarStub } },
		attachTo: document.body,
	});
	document.dispatchEvent(new CustomEvent("frappe-ai-toggle"));
	return wrapper;
}

describe("App backdrop", () => {
	// a backdrop rendered here is sized against the transformed root (css:885-902), not the
	// viewport, so it covers the panel it should sit behind and swallows its clicks
	it("renders nothing beside the panel that could overlay it", async () => {
		const wrapper = open();
		await wrapper.vm.$nextTick();
		expect(wrapper.find(".frappe-ai-overlay").exists()).toBe(false);
		wrapper.unmount();
	});

	it("leaves the panel as the only thing a click inside the root can reach", async () => {
		const wrapper = open();
		await wrapper.vm.$nextTick();
		const clickable = wrapper.findAll("[aria-hidden='true']");
		expect(clickable).toHaveLength(0);
		expect(wrapper.find(".stub-sidebar").exists()).toBe(true);
		wrapper.unmount();
	});
});
