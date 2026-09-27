import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatInput from "./ChatInput.vue";

/** The composer while an answer is streaming: the button is Stop and it is operable. */
const STREAMING = { busy: true, canCancel: true };
/** The same composer the moment the turn settles and the textarea is empty. */
const SETTLED = { busy: false, canCancel: false };

describe("the Send/Stop button at the end of a turn", () => {
	it("hands focus to the composer instead of dropping it", async () => {
		const wrapper = mount(ChatInput, { props: STREAMING, attachTo: document.body });
		const button = wrapper.find(".frappe-ai-send-btn");
		(button.element as HTMLButtonElement).focus();
		expect(document.activeElement).toBe(button.element);

		await wrapper.setProps(SETTLED);
		expect(button.attributes("disabled")).toBeDefined();
		expect(document.activeElement).toBe(wrapper.find(".frappe-ai-textarea").element);
		wrapper.unmount();
	});

	it("leaves focus where it is when the button was not the one holding it", async () => {
		const elsewhere = document.createElement("input");
		document.body.appendChild(elsewhere);
		const wrapper = mount(ChatInput, { props: STREAMING, attachTo: document.body });
		elsewhere.focus();
		await wrapper.setProps(SETTLED);
		expect(document.activeElement).toBe(elsewhere);
		wrapper.unmount();
		elsewhere.remove();
	});

	it("exposes focus() so the panel can put the caret in the composer when it opens", () => {
		const wrapper = mount(ChatInput, { props: SETTLED, attachTo: document.body });
		(wrapper.vm as unknown as { focus: () => void }).focus();
		expect(document.activeElement).toBe(wrapper.find(".frappe-ai-textarea").element);
		wrapper.unmount();
	});
});
