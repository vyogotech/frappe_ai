import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TextBlock from "./TextBlock.vue";

describe("TextBlock", () => {
  it("renders markdown content to HTML", () => {
    const wrapper = mount(TextBlock, {
      props: { block: { type: "text", content: "hello **world**" } },
    });
    expect(wrapper.find(".frappe-ai-markdown").exists()).toBe(true);
    expect(wrapper.html()).toContain("<strong>world</strong>");
  });

  it("renders an empty container for empty content (no crash)", () => {
    const wrapper = mount(TextBlock, {
      props: { block: { type: "text", content: "" } },
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find(".frappe-ai-markdown").exists()).toBe(true);
  });

  it("escapes raw HTML in agent output (XSS defence)", () => {
    // renderMarkdown runs with html:false — see comment in TextBlock.vue.
    const wrapper = mount(TextBlock, {
      props: { block: { type: "text", content: '<script>alert(1)</script>' } },
    });
    expect(wrapper.html()).not.toContain("<script>alert");
    expect(wrapper.html()).toContain("&lt;script&gt;");
  });
});
