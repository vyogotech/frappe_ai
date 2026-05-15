import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StatusList from "./StatusList.vue";

describe("StatusList", () => {
  it("renders each status item with label and status", () => {
    const wrapper = mount(StatusList, {
      props: {
        block: {
          type: "status_list",
          title: "Open Orders",
          items: [
            { label: "INV-001", status: "Paid", color: "green" },
            { label: "INV-002", status: "Overdue", color: "red" },
          ],
        },
      },
    });
    const items = wrapper.findAll(".frappe-ai-status-item");
    expect(items).toHaveLength(2);
    expect(wrapper.text()).toContain("Open Orders");
    expect(wrapper.text()).toContain("INV-001");
    expect(wrapper.text()).toContain("Overdue");
  });

  it("applies color modifier classes to dots and badges", () => {
    const wrapper = mount(StatusList, {
      props: {
        block: {
          type: "status_list",
          items: [{ label: "x", status: "OK", color: "blue" }],
        },
      },
    });
    expect(wrapper.find(".frappe-ai-status-dot--blue").exists()).toBe(true);
    expect(wrapper.find(".frappe-ai-status-badge--blue").exists()).toBe(true);
  });

  it("marks rows with a route as clickable", () => {
    const wrapper = mount(StatusList, {
      props: {
        block: {
          type: "status_list",
          items: [
            {
              label: "INV-001",
              status: "Paid",
              color: "green",
              route: { doctype: "Sales Invoice", name: "INV-001" },
            },
            { label: "INV-002", status: "Paid", color: "green" },
          ],
        },
      },
    });
    const items = wrapper.findAll(".frappe-ai-status-item");
    expect(items[0].classes()).toContain("frappe-ai-status-clickable");
    expect(items[1].classes()).not.toContain("frappe-ai-status-clickable");
  });
});
