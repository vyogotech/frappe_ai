import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatInput from "./ChatInput.vue";

describe("ChatInput", () => {
  it("renders a textarea and a send button (a11y: labelled)", () => {
    const wrapper = mount(ChatInput, {
      props: { busy: false, canCancel: false },
    });
    const textarea = wrapper.find("textarea");
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes("aria-label")).toBe("Chat input");
    const btn = wrapper.find("button.frappe-ai-send-btn");
    expect(btn.attributes("aria-label")).toBe("Send message");
  });

  it("disables the send button when idle and empty, enables once text is typed", async () => {
    const wrapper = mount(ChatInput, {
      props: { busy: false, canCancel: false },
    });
    const btn = wrapper.find("button.frappe-ai-send-btn");
    expect(btn.attributes("disabled")).toBeDefined();
    await wrapper.find("textarea").setValue("hello");
    expect(btn.attributes("disabled")).toBeUndefined();
    await btn.trigger("click");
    expect(wrapper.emitted("send")?.[0]).toEqual(["hello"]);
  });

  it("renders the stop button when busy + cancellable and emits 'stop' on click", async () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: true },
    });
    const btn = wrapper.find("button.frappe-ai-send-btn");
    expect(btn.attributes("aria-label")).toBe("Stop generating");
    expect(btn.classes()).toContain("frappe-ai-send-btn--stop");
    await btn.trigger("click");
    expect(wrapper.emitted("stop")).toHaveLength(1);
    expect(wrapper.emitted("send")).toBeUndefined();
  });
});
