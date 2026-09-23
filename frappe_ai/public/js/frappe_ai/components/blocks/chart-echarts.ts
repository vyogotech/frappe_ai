/** The echarts pieces ChartBlock draws with, registered once. */

// Imported by frappe_ai_chart.bundle.ts and by the tests that need a real chart, never by the desk
// bundle: that would put the whole library back on every desk page.

import { use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { BarChart, LineChart, PieChart, FunnelChart, HeatmapChart } from "echarts/charts";
import {
	GridComponent,
	TooltipComponent,
	LegendComponent,
	VisualMapComponent,
	CalendarComponent,
} from "echarts/components";
// echarts' own entry point for the aria component, which registers itself on import.
// Taking AriaComponent from the "echarts/components" barrel instead would oblige every
// vi.mock of that barrel to enumerate it.
import "echarts/lib/component/aria";

// SVG renderer gives crisper output than canvas (no DPR-blur, scales
// cleanly at any zoom). Slightly slower for huge datasets but charts
// in this sidebar are small.
use([
	SVGRenderer,
	BarChart,
	LineChart,
	PieChart,
	FunnelChart,
	HeatmapChart,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	VisualMapComponent,
	CalendarComponent,
]);

export { init, throttle } from "echarts/core";
