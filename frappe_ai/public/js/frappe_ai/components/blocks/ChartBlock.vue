<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
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
import VChart from "vue-echarts";
import { formatValue } from "../../utils/formatters";
import type { ChartBlock } from "../../types/blocks";

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

const props = defineProps<{ block: ChartBlock }>();

const hasData = computed(() => {
	return props.block.data.datasets.length > 0 && props.block.data.labels.length > 0;
});

// Pull the chart palette + typography from Frappe's CSS variables so
// charts live inside the Desk theme rather than fighting it. Read once
// on mount — Frappe doesn't hot-swap themes mid-session.
//   --text-color, --text-muted, --border-color, --bg-light-gray come
// from Frappe core. --ai-* tokens live in frappe_ai_sidebar.bundle.css.
const theme = ref({
	textColor: "",
	textMuted: "",
	borderColor: "",
	cellBg: "",
	onFill: "",
	fontFamily: "",
	palette: [] as string[],
});

onMounted(() => {
	const cs = getComputedStyle(document.documentElement);
	const read = (name: string) => cs.getPropertyValue(name).trim();
	theme.value = {
		textColor: read("--text-color"),
		textMuted: read("--text-muted"),
		borderColor: read("--border-color"),
		// Cell-separator background for heatmap/calendar grids — uses the
		// panel/card surface so cells appear cut out of the panel.
		cellBg: read("--card-bg") || read("--bg-color"),
		// Text color drawn on top of filled chart segments (funnel inside
		// labels). Frappe's --white or --bg-color works for the dark Frappe
		// palette colors; falls through to echarts' own default if neither
		// token is defined (so frappe_ai stays usable outside Desk).
		onFill: read("--ai-chart-on-fill") || read("--white"),
		fontFamily: read("--font-stack") || read("--font-family"),
		// echarts color cycle — read the AI accent + a few semantic Frappe
		// tokens so charts match the sidebar header / KPI / status_list
		// palette rather than echarts' default magenta/cyan cycle.
		palette: [
			read("--ai-accent"),
			read("--green-500"),
			read("--orange-500"),
			read("--purple-500"),
			read("--red-500"),
			read("--blue-500"),
		].filter(Boolean),
	};
});

const chartOption = computed(() => {
	const { chart_type, data, options } = props.block;
	const currency = options?.currency;
	const t = theme.value;

	// Shared base — applied to every chart type so colors, fonts, and
	// tooltip behavior come from Frappe's design tokens, not echarts
	// defaults. Empty strings fall through to echarts' own defaults
	// (which is what we want during SSR / pre-mount when CSS vars
	// haven't been read yet).
	const base = {
		color: t.palette.length ? t.palette : undefined,
		textStyle: t.fontFamily ? { fontFamily: t.fontFamily, color: t.textColor || undefined } : undefined,
	};
	const axisLabelStyle = {
		fontFamily: t.fontFamily || undefined,
		color: t.textMuted || undefined,
	};
	const tooltipBase = { confine: true, textStyle: { fontFamily: t.fontFamily || undefined } };

	if (chart_type === "pie" || chart_type === "funnel") {
		const items = data.labels.map((label, i) => ({
			name: label,
			value: data.datasets[0]?.values[i] ?? 0,
		}));

		if (chart_type === "pie") {
			return {
				...base,
				tooltip: {
					...tooltipBase,
					trigger: "item",
					formatter: (p: { name: string; value: number }) =>
						`${p.name}: ${formatValue(p.value, currency ? "currency" : "number", { currency })}`,
				},
				legend: { orient: "horizontal", bottom: 0, type: "scroll", textStyle: axisLabelStyle },
				series: [
					{
						type: "pie",
						radius: ["38%", "62%"],
						center: ["50%", "44%"],
						avoidLabelOverlap: true,
						label: { show: false },
						labelLine: { show: false },
						itemStyle: { borderColor: t.borderColor || "transparent", borderWidth: 1 },
						data: items,
					},
				],
			};
		}

		return {
			...base,
			tooltip: { ...tooltipBase, trigger: "item" },
			legend: { orient: "horizontal", bottom: 0, type: "scroll", textStyle: axisLabelStyle },
			series: [
				{
					type: "funnel",
					top: 10,
					bottom: 40,
					left: "10%",
					width: "80%",
					label: { show: true, position: "inside", color: t.onFill || undefined },
					data: items,
				},
			],
		};
	}

	if (chart_type === "heatmap") {
		const allValues = data.datasets.flatMap((ds) => ds.values.map((v) => Number(v)));
		const min = Math.min(...allValues);
		const max = Math.max(...allValues);
		const heatData: [number, number, number][] = [];
		data.datasets.forEach((ds, yi) => {
			ds.values.forEach((v, xi) => {
				heatData.push([xi, yi, Number(v)]);
			});
		});

		return {
			...base,
			tooltip: { ...tooltipBase, position: "top" },
			grid: { left: 60, right: 8, top: 16, bottom: 64, containLabel: false },
			xAxis: {
				type: "category",
				data: data.labels,
				axisLabel: { interval: 0, rotate: 30, ...axisLabelStyle },
			},
			yAxis: {
				type: "category",
				data: data.datasets.map((ds) => ds.name),
				axisLabel: { interval: 0, ...axisLabelStyle },
			},
			visualMap: {
				min,
				max,
				calculable: true,
				orient: "horizontal",
				left: "center",
				bottom: 0,
				itemWidth: 12,
				itemHeight: 80,
				textStyle: axisLabelStyle,
			},
			series: [
				{
					type: "heatmap",
					data: heatData,
					label: { show: true, color: t.textColor || undefined },
					itemStyle: { borderColor: t.cellBg || t.borderColor || undefined, borderWidth: 1 },
				},
			],
		};
	}

	if (chart_type === "calendar") {
		const calValues = (data.datasets[0]?.values ?? []).map(Number);
		const calData = data.labels.map((label, i) => [label, calValues[i] ?? 0]);
		const year = data.labels[0]?.slice(0, 4) || new Date().getFullYear().toString();
		const calMin = calValues.length ? Math.min(...calValues) : 0;
		const calMax = calValues.length ? Math.max(...calValues) : 1;

		return {
			...base,
			tooltip: { ...tooltipBase, position: "top" },
			visualMap: {
				min: calMin,
				max: calMax,
				calculable: true,
				orient: "horizontal",
				left: "center",
				bottom: 0,
				itemWidth: 12,
				itemHeight: 80,
				textStyle: axisLabelStyle,
			},
			calendar: {
				range: year,
				cellSize: ["auto", "auto"],
				top: 28,
				left: 24,
				right: 8,
				bottom: 56,
				orient: "horizontal",
				yearLabel: { show: false },
				monthLabel: { ...axisLabelStyle, nameMap: "EN" },
				dayLabel: { ...axisLabelStyle, nameMap: "EN", firstDay: 1 },
				splitLine: { show: false },
				itemStyle: {
					borderColor: t.cellBg || t.borderColor || undefined,
					borderWidth: 1,
				},
			},
			series: [{ type: "heatmap", coordinateSystem: "calendar", data: calData }],
		};
	}

	// Bar and Line (cartesian)
	const series = data.datasets.map((ds) => ({
		name: ds.name,
		type: chart_type,
		data: ds.values,
		stack: options?.stacked ? "total" : undefined,
		smooth: chart_type === "line",
		showSymbol: chart_type === "line",
		symbolSize: 6,
		lineStyle: chart_type === "line" ? { width: 2 } : undefined,
		itemStyle: { borderRadius: chart_type === "bar" ? [3, 3, 0, 0] : 0 },
	}));

	return {
		...base,
		tooltip: {
			...tooltipBase,
			trigger: "axis",
			valueFormatter: (v: number) =>
				formatValue(v, currency ? "currency" : "number", { currency }),
		},
		legend: {
			data: data.datasets.map((ds) => ds.name),
			bottom: 0,
			type: "scroll",
			textStyle: axisLabelStyle,
		},
		grid: { left: 4, right: 8, top: 16, bottom: 48, containLabel: true },
		xAxis: {
			type: "category",
			data: data.labels,
			axisLabel: { interval: 0, rotate: 30, ...axisLabelStyle },
			axisLine: { lineStyle: { color: t.borderColor || undefined } },
		},
		yAxis: {
			type: "value",
			axisLabel: axisLabelStyle,
			splitLine: { lineStyle: { color: t.borderColor || undefined } },
		},
		series,
	};
});
</script>

<template>
	<div class="frappe-ai-chart">
		<div v-if="block.title" class="frappe-ai-chart-title">{{ block.title }}</div>
		<div v-if="!hasData" class="frappe-ai-chart-empty">No data available</div>
		<VChart
			v-else
			class="frappe-ai-chart-canvas"
			:option="chartOption"
			:autoresize="true"
		/>
	</div>
</template>

<style scoped>
.frappe-ai-chart {
	max-width: 100%;
	width: 100%;
	overflow: hidden;
}
/* Height comes from a CSS variable so themes / host integrations can
   override it without patching the component. Falls back to a value
   tuned for the default sidebar width. */
.frappe-ai-chart-canvas {
	width: 100%;
	height: var(--ai-chart-height, 320px);
}
.frappe-ai-chart-title {
	font-weight: 600;
	margin-bottom: 4px;
	color: var(--text-color);
}
.frappe-ai-chart-empty {
	color: var(--text-muted);
	padding: 16px;
	text-align: center;
}
</style>
