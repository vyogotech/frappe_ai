import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBubble from "../MessageBubble.vue";
import type { Message } from "@/types/messages";

function assistant(partial: Partial<Message>): Message {
  return {
    id: "x",
    role: "assistant",
    content: "",
    timestamp: new Date("2026-04-24T12:00:00Z"),
    ...partial,
  };
}

describe("MessageBubble — pending placeholder", () => {
  it("shows just the three bouncing dots when pending and no statusText", () => {
    const wrapper = mount(MessageBubble, {
      props: { message: assistant({ pending: true }) },
    });
    const status = wrapper.find(".frappe-ai-bubble-status");
    expect(status.exists()).toBe(true);
    // No status-text span when statusText is unset — just dots.
    expect(wrapper.find(".frappe-ai-bubble-status-text").exists()).toBe(false);
    expect(wrapper.findAll(".frappe-ai-bubble-status-dot")).toHaveLength(3);
  });

  it("shows backend statusText inside the status block when provided", () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: assistant({
          pending: true,
          metadata: { statusText: "Looking up Bobby Simmons" },
        }),
      },
    });
    expect(wrapper.find(".frappe-ai-bubble-status").text()).toContain(
      "Looking up Bobby Simmons",
    );
  });

  it("does NOT show the status block once content has streamed in", () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: assistant({
          pending: false,
          content: "Done.",
        }),
      },
    });
    expect(wrapper.find(".frappe-ai-bubble-status").exists()).toBe(false);
    expect(wrapper.find(".frappe-ai-markdown").exists()).toBe(true);
  });

  it("hides the timestamp while pending and empty", () => {
    const wrapper = mount(MessageBubble, {
      props: { message: assistant({ pending: true }) },
    });
    expect(wrapper.find(".frappe-ai-bubble-time").exists()).toBe(false);
  });

  it("shows the timestamp once content has arrived", () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: assistant({ pending: false, content: "Hi" }),
      },
    });
    expect(wrapper.find(".frappe-ai-bubble-time").exists()).toBe(true);
  });
});
