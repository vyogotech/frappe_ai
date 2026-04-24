import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatInput from "../ChatInput.vue";

describe("ChatInput — busy / canCancel toggle", () => {
  it("keeps the textarea editable while busy", () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: true },
    });
    const textarea = wrapper.find("textarea");
    expect(textarea.attributes("disabled")).toBeUndefined();
  });

  it("does not render a hint text below the input", () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: true },
    });
    expect(wrapper.find(".frappe-ai-input-hint").exists()).toBe(false);
  });

  it("shows the stop variant when busy && canCancel", () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: true },
    });
    const btn = wrapper.find(".frappe-ai-send-btn");
    expect(btn.classes()).toContain("frappe-ai-send-btn--stop");
    expect(btn.attributes("title")).toBe("Stop generating");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("shows a DISABLED send variant when busy && !canCancel (fallback mode)", () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: false },
    });
    const btn = wrapper.find(".frappe-ai-send-btn");
    expect(btn.classes()).not.toContain("frappe-ai-send-btn--stop");
    expect(btn.attributes("disabled")).toBeDefined();
    expect(btn.attributes("title")).toBe("Send message");
  });

  it("shows the send variant when idle", () => {
    const wrapper = mount(ChatInput, {
      props: { busy: false, canCancel: false },
    });
    const btn = wrapper.find(".frappe-ai-send-btn");
    expect(btn.classes()).not.toContain("frappe-ai-send-btn--stop");
    expect(btn.attributes("title")).toBe("Send message");
  });

  it("emits 'stop' when the button is clicked while busy && canCancel", async () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: true },
    });
    await wrapper.find(".frappe-ai-send-btn").trigger("click");
    expect(wrapper.emitted("stop")).toHaveLength(1);
    expect(wrapper.emitted("send")).toBeUndefined();
  });

  it("emits neither 'stop' nor 'send' when clicked while busy && !canCancel", async () => {
    const wrapper = mount(ChatInput, {
      props: { busy: true, canCancel: false },
    });
    await wrapper.find("textarea").setValue("queued text");
    await wrapper.find(".frappe-ai-send-btn").trigger("click");
    expect(wrapper.emitted("stop")).toBeUndefined();
    expect(wrapper.emitted("send")).toBeUndefined();
  });

  it("emits 'send' with the trimmed text when the button is clicked while idle", async () => {
    const wrapper = mount(ChatInput, {
      props: { busy: false, canCancel: false },
    });
    await wrapper.find("textarea").setValue("  hi there  ");
    await wrapper.find(".frappe-ai-send-btn").trigger("click");
    expect(wrapper.emitted("send")?.[0]).toEqual(["hi there"]);
  });
});
