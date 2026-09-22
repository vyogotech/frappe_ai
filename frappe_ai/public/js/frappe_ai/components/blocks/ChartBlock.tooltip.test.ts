import { describe, expect, it, vi } from "vitest";

vi.mock("echarts/core", async () => ({
	use: vi.fn(),
	format: (await vi.importActual<typeof import("echarts/core")>("echarts/core")).format,
}));
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
vi.mock("vue-echarts", () => ({
	default: { name: "VChart", props: ["option"], template: "<div />" },
}));

import { mount } from "@vue/test-utils";
import ChartBlock from "./ChartBlock.vue";

// echarts writes a function formatter's string into the tooltip with innerHTML, and the labels come from the model
describe("ChartBlock tooltip", () => {
	it("shows a model-written label as text, never as markup", () => {
		const wrapper = mount(ChartBlock, {
			props: {
				block: {
					type: "chart",
					chart_type: "pie",
					title: "Share",
					data: {
						labels: ['<img src=x onerror="alert(1)">'],
						datasets: [{ name: "n", values: [1] }],
					},
				},
			},
		});
		const option = wrapper.findComponent({ name: "VChart" }).props("option") as {
			tooltip: { formatter: (p: { name: string; value: number }) => string };
		};
		const html = option.tooltip.formatter({
			name: '<img src=x onerror="alert(1)">',
			value: 1,
		});
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});
});
