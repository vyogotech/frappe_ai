import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import ChatSidebar from "./ChatSidebar.vue";

// Stub all three children — ChatSidebar's job is composition + width style,
// not what its panels actually render. Each child has its own tests.
const HeaderStub = defineComponent({
  name: "ChatHeader",
  emits: ["clear", "close"],
  template: '<div class="stub-header" />',
});
const MessagesStub = defineComponent({
  name: "ChatMessages",
  props: { messages: { type: Array, required: true } },
  emits: ["send"],
  template: '<div class="stub-messages" />',
});
const InputStub = defineComponent({
  name: "ChatInput",
  props: { busy: Boolean, canCancel: Boolean },
  emits: ["send", "stop"],
  template: '<div class="stub-input" />',
});
const stubs = {
  ChatHeader: HeaderStub,
  ChatMessages: MessagesStub,
  ChatInput: InputStub,
};

describe("ChatSidebar", () => {
  it("renders the three composed regions (header / messages / input)", () => {
    const wrapper = mount(ChatSidebar, {
      props: { sidebarWidth: 380, keyboardShortcut: "Ctrl+K" },
      global: { stubs },
    });
    expect(wrapper.find(".stub-header").exists()).toBe(true);
    expect(wrapper.find(".stub-messages").exists()).toBe(true);
    expect(wrapper.find(".stub-input").exists()).toBe(true);
  });

  it("applies the sidebarWidth prop as an inline style", () => {
    const wrapper = mount(ChatSidebar, {
      props: { sidebarWidth: 420, keyboardShortcut: "Ctrl+K" },
      global: { stubs },
    });
    const root = wrapper.find(".frappe-ai-sidebar");
    expect(root.exists()).toBe(true);
    expect(root.attributes("style")).toContain("420px");
  });

  it("emits 'close' when the inner ChatHeader's close event bubbles up", async () => {
    const wrapper = mount(ChatSidebar, {
      props: { sidebarWidth: 380, keyboardShortcut: "Ctrl+K" },
      global: { stubs },
    });
    const header = wrapper.findComponent(HeaderStub);
    expect(header.exists()).toBe(true);
    header.vm.$emit("close");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
