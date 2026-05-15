import { describe, expect, it, vi } from "vitest";

// Stub the heavy echarts core/renderer/chart entry points before the
// component imports them — happy-dom/jsdom can't run echarts' SVGRenderer
// (no real layout) and we don't need a real chart for these assertions.
vi.mock("echarts/core", () => ({ use: vi.fn() }));
vi.mock("echarts/renderers", () => ({ SVGRenderer: {} }));
vi.mock("echarts/charts", () => ({
  BarChart: {},
  LineChart: {},
  PieChart: {},
  FunnelChart: {},
  HeatmapChart: {},
}));
vi.mock("echarts/components", () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  VisualMapComponent: {},
  CalendarComponent: {},
}));
vi.mock("vue-echarts", () => ({ default: { name: "VChart", template: "<div />" } }));

import { mount } from "@vue/test-utils";
import ChartBlock from "./ChartBlock.vue";

const stubs = { VChart: true };

describe("ChartBlock", () => {
  it("renders a chart canvas when data is present", () => {
    const wrapper = mount(ChartBlock, {
      props: {
        block: {
          type: "chart",
          chart_type: "bar",
          title: "Revenue by Quarter",
          data: {
            labels: ["Q1", "Q2"],
            datasets: [{ name: "Revenue", values: [10, 20] }],
          },
        },
      },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Revenue by Quarter");
    expect(wrapper.find(".frappe-ai-chart-empty").exists()).toBe(false);
    // VChart is stubbed — verify the stub rendered in its slot.
    expect(wrapper.findComponent({ name: "VChart" }).exists()).toBe(true);
  });

  it("shows empty-state placeholder when data is missing", () => {
    const wrapper = mount(ChartBlock, {
      props: {
        block: {
          type: "chart",
          chart_type: "bar",
          data: { labels: [], datasets: [] },
        },
      },
      global: { stubs },
    });
    expect(wrapper.find(".frappe-ai-chart-empty").exists()).toBe(true);
    expect(wrapper.text()).toContain("No data available");
    expect(wrapper.findComponent({ name: "VChart" }).exists()).toBe(false);
  });

  it("renders without crashing for non-cartesian chart types (pie)", () => {
    const wrapper = mount(ChartBlock, {
      props: {
        block: {
          type: "chart",
          chart_type: "pie",
          data: {
            labels: ["A", "B", "C"],
            datasets: [{ name: "Share", values: [40, 30, 30] }],
          },
        },
      },
      global: { stubs },
    });
    expect(wrapper.find(".frappe-ai-chart").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "VChart" }).exists()).toBe(true);
  });
});
