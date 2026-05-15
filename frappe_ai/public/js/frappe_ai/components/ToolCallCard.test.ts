import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ToolCallCard from "./ToolCallCard.vue";
import type { ToolCall } from "../types/messages";

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    call_id: "c1",
    name: "frappe.get_all",
    arguments: { doctype: "User", limit: 10 },
    status: "done",
    timestamp: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("ToolCallCard", () => {
  it("renders tool name in a collapsed header by default (a11y: aria-expanded)", () => {
    const wrapper = mount(ToolCallCard, { props: { toolCall: makeCall() } });
    const header = wrapper.find("button.frappe-ai-tool-header");
    expect(header.exists()).toBe(true);
    expect(header.attributes("aria-expanded")).toBe("false");
    expect(wrapper.text()).toContain("frappe.get_all");
    // Body sections only render when expanded.
    expect(wrapper.find(".frappe-ai-tool-section").exists()).toBe(false);
  });

  it("expands to show arguments JSON when header is clicked", async () => {
    const wrapper = mount(ToolCallCard, { props: { toolCall: makeCall() } });
    await wrapper.find("button.frappe-ai-tool-header").trigger("click");
    expect(wrapper.find("button.frappe-ai-tool-header").attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".frappe-ai-tool-section").exists()).toBe(true);
    const pre = wrapper.find("pre.frappe-ai-tool-pre");
    expect(pre.exists()).toBe(true);
    expect(pre.text()).toContain('"doctype"');
    expect(pre.text()).toContain('"User"');
  });

  it("renders the Result toggle only when a result is present", async () => {
    const withResult = mount(ToolCallCard, {
      props: { toolCall: makeCall({ result: "ok" }) },
    });
    await withResult.find("button.frappe-ai-tool-header").trigger("click");
    expect(withResult.find(".frappe-ai-tool-expand-btn").exists()).toBe(true);

    const noResult = mount(ToolCallCard, {
      props: { toolCall: makeCall({ result: undefined }) },
    });
    await noResult.find("button.frappe-ai-tool-header").trigger("click");
    expect(noResult.find(".frappe-ai-tool-expand-btn").exists()).toBe(false);
  });
});
