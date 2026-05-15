import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBubble from "./MessageBubble.vue";
import type { Message } from "../types/messages";

describe("MessageBubble", () => {
  it("renders a user message with its raw content and role class", () => {
    const msg: Message = {
      id: "1",
      role: "user",
      content: "hello there",
      timestamp: new Date("2026-01-01T10:00:00Z"),
    };
    const wrapper = mount(MessageBubble, { props: { message: msg } });
    expect(wrapper.find(".frappe-ai-bubble--user").exists()).toBe(true);
    expect(wrapper.text()).toContain("hello there");
  });

  it("renders the pending-pulse for an empty pending assistant bubble", () => {
    const msg: Message = {
      id: "2",
      role: "assistant",
      content: "",
      pending: true,
      timestamp: null,
    };
    const wrapper = mount(MessageBubble, { props: { message: msg } });
    expect(wrapper.find(".frappe-ai-bubble-status").exists()).toBe(true);
    expect(wrapper.findAll(".frappe-ai-bubble-status-dot")).toHaveLength(3);
    // Pending+empty hides the timestamp.
    expect(wrapper.find(".frappe-ai-bubble-time").exists()).toBe(false);
  });

  it("renders assistant markdown content once a chunk has arrived", () => {
    const msg: Message = {
      id: "3",
      role: "assistant",
      content: "Here is **bold** text",
      pending: false,
      timestamp: new Date("2026-01-01T10:00:00Z"),
    };
    const wrapper = mount(MessageBubble, { props: { message: msg } });
    expect(wrapper.find(".frappe-ai-bubble-status").exists()).toBe(false);
    expect(wrapper.find(".frappe-ai-markdown").exists()).toBe(true);
    expect(wrapper.html()).toContain("<strong>bold</strong>");
  });

  it("renders an error message with the error info payload", () => {
    const msg: Message = {
      id: "4",
      role: "error",
      content: "",
      error: { code: "BOOM", message: "something broke", suggestion: "try again" },
      timestamp: new Date("2026-01-01T10:00:00Z"),
    };
    const wrapper = mount(MessageBubble, { props: { message: msg } });
    expect(wrapper.find(".frappe-ai-error").exists()).toBe(true);
    expect(wrapper.text()).toContain("something broke");
    expect(wrapper.text()).toContain("try again");
  });
});
