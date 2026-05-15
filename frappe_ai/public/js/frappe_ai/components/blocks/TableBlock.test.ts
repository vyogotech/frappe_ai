import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TableBlock from "./TableBlock.vue";

describe("TableBlock", () => {
  it("renders rows under the declared columns", () => {
    const wrapper = mount(TableBlock, {
      props: {
        block: {
          type: "table",
          title: "Customers",
          columns: [
            { key: "name", label: "Name" },
            { key: "revenue", label: "Revenue" },
          ],
          rows: [
            { values: { name: "Acme", revenue: 1000 } },
            { values: { name: "Globex", revenue: 500 } },
          ],
        },
      },
    });
    expect(wrapper.text()).toContain("Customers");
    expect(wrapper.findAll("thead th")).toHaveLength(2);
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.text()).toContain("Acme");
    expect(wrapper.text()).toContain("Globex");
  });

  it("shows empty-state placeholder when rows is empty", () => {
    const wrapper = mount(TableBlock, {
      props: {
        block: {
          type: "table",
          columns: [{ key: "name", label: "Name" }],
          rows: [],
        },
      },
    });
    expect(wrapper.find(".frappe-ai-table-empty").exists()).toBe(true);
    expect(wrapper.text()).toContain("No data available");
    expect(wrapper.find("table").exists()).toBe(false);
  });

  it("toggles sort direction when a header is clicked twice", async () => {
    const wrapper = mount(TableBlock, {
      props: {
        block: {
          type: "table",
          columns: [{ key: "n", label: "N" }],
          rows: [{ values: { n: 2 } }, { values: { n: 1 } }, { values: { n: 3 } }],
        },
      },
    });
    const header = wrapper.find("thead th");
    // First click: asc → arrow up.
    await header.trigger("click");
    expect(wrapper.html()).toContain("↑");
    // Second click: desc → arrow down.
    await header.trigger("click");
    expect(wrapper.html()).toContain("↓");
  });
});
