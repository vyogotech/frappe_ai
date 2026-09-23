/** The echarts option for a chart block: the desk's theme tokens in, one option object out. */

import { format } from "echarts/core";
import { formatValue } from "../../utils/formatters";
import type { ChartBlock } from "../../types/blocks";

export interface ChartTheme {
	textColor: string;
	textMuted: string;
	borderColor: string;
	cellBg: string;
	onFill: string;
	fontFamily: string;
	palette: string[];
}

/** The desk's tokens; every one it does not define stays empty, and echarts keeps its own default. */
export function readChartTheme(): ChartTheme {
	const cs = getComputedStyle(document.documentElement);
	const read = (name: string) => cs.getPropertyValue(name).trim();
	return {
		textColor: read("--text-color"),
		textMuted: read("--text-muted"),
		borderColor: read("--border-color"),
		// Cell-separator background for heatmap/calendar grids — uses the
		// panel/card surface so cells appear cut out of the panel.
		cellBg: read("--card-bg") || read("--bg-color"),
		// label colour on filled funnel segments; empty outside the Desk, where echarts' default applies
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
}

export function buildChartOption(block: ChartBlock, t: ChartTheme) {
	const { chart_type, data, options } = block;
	const currency = options?.currency;

	// an empty token (before mount) becomes undefined so echarts keeps its own default
	const base = {
		// role="img" plus a description echarts builds from the series names, the
		// category labels and the values it is about to draw (WCAG 2.2 SC 1.1.1).
		// decal is left off: hatching the marks would change what a sighted user sees.
		aria: {
			enabled: true,
			// on a cartesian series dimension 0 is the category index, which the
			// description already reads out by name — spread, not `label: undefined`,
			// which would keep echarts from filling in its own label defaults
			...((chart_type === "bar" || chart_type === "line") && {
				label: { data: { excludeDimensionId: [0] } },
			}),
		},
		color: t.palette.length ? t.palette : undefined,
		textStyle: t.fontFamily
			? { fontFamily: t.fontFamily, color: t.textColor || undefined }
			: undefined,
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
						`${format.encodeHTML(p.name)}: ${formatValue(p.value, currency ? "currency" : "number", { currency })}`,
				},
				legend: {
					orient: "horizontal",
					bottom: 0,
					type: "scroll",
					textStyle: axisLabelStyle,
				},
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
					itemStyle: {
						borderColor: t.cellBg || t.borderColor || undefined,
						borderWidth: 1,
					},
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
			// the calendar coordinate system parses each date into a timestamp, and echarts'
			// generated description reads that back, so it would say "1767186000000, 4"
			aria: {
				enabled: true,
				label: {
					description: `Calendar of ${data.datasets[0]?.name || "values"} by date. ${calData
						.map(([label, value]) => `${label}: ${value}`)
						.join(", ")}`,
				},
			},
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
}
