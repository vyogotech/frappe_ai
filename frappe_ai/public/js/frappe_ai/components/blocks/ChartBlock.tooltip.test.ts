import { describe, expect, it } from "vitest";
import { buildChartOption, readChartTheme } from "./chart-option";

// echarts writes a function formatter's string into the tooltip with innerHTML, and the labels come from the model
describe("ChartBlock tooltip", () => {
	it("shows a model-written label as text, never as markup", () => {
		const label = '<img src=x onerror="alert(1)">';
		const option = buildChartOption(
			{
				type: "chart",
				chart_type: "pie",
				title: "Share",
				data: { labels: [label], datasets: [{ name: "n", values: [1] }] },
			},
			readChartTheme(),
		) as unknown as {
			tooltip: { formatter: (p: { name: string; value: number }) => string };
		};

		const html = option.tooltip.formatter({ name: label, value: 1 });
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});
});
