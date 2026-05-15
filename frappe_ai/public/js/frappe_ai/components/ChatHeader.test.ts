import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatHeader from "./ChatHeader.vue";

describe("ChatHeader", () => {
  it("renders the app title and two icon buttons", () => {
    const wrapper = mount(ChatHeader);
    expect(wrapper.text()).toContain("Frappe AI");
    const buttons = wrapper.findAll("button.frappe-ai-icon-btn");
    expect(buttons).toHaveLength(2);
  });

  it("emits 'clear' when the new-conversation button is clicked", async () => {
    const wrapper = mount(ChatHeader);
    const clearBtn = wrapper.find('button[aria-label="New conversation"]');
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    expect(wrapper.emitted("clear")).toHaveLength(1);
  });

  it("emits 'close' when the close button is clicked (a11y: labelled)", async () => {
    const wrapper = mount(ChatHeader);
    const closeBtn = wrapper.find('button[aria-label="Close sidebar"]');
    expect(closeBtn.exists()).toBe(true);
    expect(closeBtn.attributes("aria-label")).toBe("Close sidebar");
    await closeBtn.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
