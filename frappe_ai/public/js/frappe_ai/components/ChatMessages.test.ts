import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatMessages from "./ChatMessages.vue";
import type { Message } from "../types/messages";

// Stub the children — we're testing the routing/empty-state logic here,
// not how individual bubbles render (those have their own tests).
const stubs = {
  MessageBubble: { props: ["message"], template: '<div class="stub-bubble" />' },
  ToolCallCard: { props: ["toolCall"], template: '<div class="stub-toolcard" />' },
};

describe("ChatMessages", () => {
  it("renders the empty state with starter prompt chips when no messages", () => {
    const wrapper = mount(ChatMessages, {
      props: { messages: [] },
      global: { stubs },
    });
    expect(wrapper.find(".frappe-ai-empty-state").exists()).toBe(true);
    expect(wrapper.text()).toContain("How can I help?");
    const chips = wrapper.findAll(".frappe-ai-starter-chip");
    expect(chips).toHaveLength(3);
  });

  it("emits 'send' with the chip's text when a starter prompt is clicked", async () => {
    const wrapper = mount(ChatMessages, {
      props: { messages: [] },
      global: { stubs },
    });
    const chip = wrapper.find(".frappe-ai-starter-chip");
    await chip.trigger("click");
    const events = wrapper.emitted("send");
    expect(events).toHaveLength(1);
    expect(typeof events?.[0][0]).toBe("string");
    expect((events?.[0][0] as string).length).toBeGreaterThan(0);
  });

  it("routes tool_call messages to ToolCallCard and others to MessageBubble", () => {
    const messages: Message[] = [
      { id: "1", role: "user", content: "hi", timestamp: null },
      {
        id: "2",
        role: "tool_call",
        content: "",
        toolCall: {
          call_id: "x",
          name: "frappe.get_all",
          arguments: {},
          status: "done",
        },
        timestamp: null,
      },
      { id: "3", role: "assistant", content: "ok", timestamp: null },
    ];
    const wrapper = mount(ChatMessages, {
      props: { messages },
      global: { stubs },
    });
    expect(wrapper.findAll(".stub-bubble")).toHaveLength(2);
    expect(wrapper.findAll(".stub-toolcard")).toHaveLength(1);
    // Empty state is gone once we have messages.
    expect(wrapper.find(".frappe-ai-empty-state").exists()).toBe(false);
  });
});
