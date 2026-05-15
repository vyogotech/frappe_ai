import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import KPICards from "./KPICards.vue";

describe("KPICards", () => {
  it("renders one card per metric with label and value", () => {
    const wrapper = mount(KPICards, {
      props: {
        block: {
          type: "kpi",
          metrics: [
            { label: "Revenue", value: 1000 },
            { label: "Orders", value: 42 },
          ],
        },
      },
    });
    const cards = wrapper.findAll(".frappe-ai-kpi-card");
    expect(cards).toHaveLength(2);
    expect(wrapper.text()).toContain("Revenue");
    expect(wrapper.text()).toContain("Orders");
  });

  it("renders trend indicator when metric has a trend", () => {
    const wrapper = mount(KPICards, {
      props: {
        block: {
          type: "kpi",
          metrics: [
            { label: "Up", value: 100, trend: "up", trend_value: "+5%" },
            { label: "Flat", value: 50 },
          ],
        },
      },
    });
    // Up metric has trend marker, Flat does not.
    expect(wrapper.find(".frappe-ai-trend--up").exists()).toBe(true);
    expect(wrapper.find(".frappe-ai-trend--flat").exists()).toBe(false);
    expect(wrapper.text()).toContain("+5%");
  });

  it("renders empty container with no metrics (no crash)", () => {
    const wrapper = mount(KPICards, {
      props: { block: { type: "kpi", metrics: [] } },
    });
    expect(wrapper.findAll(".frappe-ai-kpi-card")).toHaveLength(0);
    expect(wrapper.find(".frappe-ai-kpi-container").exists()).toBe(true);
  });
});
