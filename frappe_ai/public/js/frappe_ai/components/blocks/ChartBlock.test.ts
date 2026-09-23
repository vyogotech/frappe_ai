import { describe, expect, it } from "vitest";
import { shallowMount } from "@vue/test-utils";
import ChartBlock from "./ChartBlock.vue";
import { buildChartOption, readChartTheme } from "./chart-option";
import type { ChartType } from "../../types/blocks";

describe("ChartBlock", () => {
	it("renders a chart canvas when data is present", () => {
		const wrapper = shallowMount(ChartBlock, {
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
		});
		expect(wrapper.text()).toContain("Revenue by Quarter");
		expect(wrapper.find(".frappe-ai-chart-empty").exists()).toBe(false);
		expect(wrapper.find(".frappe-ai-chart-canvas").exists()).toBe(true);
	});

	it("shows empty-state placeholder when data is missing", () => {
		const wrapper = shallowMount(ChartBlock, {
			props: {
				block: {
					type: "chart",
					chart_type: "bar",
					data: { labels: [], datasets: [] },
				},
			},
		});
		expect(wrapper.find(".frappe-ai-chart-empty").exists()).toBe(true);
		expect(wrapper.text()).toContain("No data available");
		expect(wrapper.find(".frappe-ai-chart-canvas").exists()).toBe(false);
	});

	// one key per branch that no other branch sets, so a chart type that fell through to the cartesian
	// default — which happily builds a series for any type — would fail here
	const OWN_KEY: Record<ChartType, string> = {
		bar: "xAxis.data",
		line: "xAxis.data",
		pie: "series.0.radius",
		funnel: "series.0.label.show",
		heatmap: "visualMap",
		calendar: "calendar.range",
	};

	it("builds each chart type on its own coordinate system", () => {
		for (const [chart_type, key] of Object.entries(OWN_KEY)) {
			const option = buildChartOption(
				{
					type: "chart",
					chart_type: chart_type as ChartType,
					data: {
						labels: ["2026-01-01", "2026-01-02"],
						datasets: [{ name: "Share", values: [40, 30] }],
					},
				},
				readChartTheme(),
			);
			expect(option.series, chart_type).toHaveLength(1);
			expect(option, chart_type).toHaveProperty(key);
		}
	});
});
