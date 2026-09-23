<script lang="ts">
// module scope, so the bundle is fetched once however many chart blocks mount: frappe's own de-dup list
// is written only after the script has run (frappe/public/js/frappe/assets.js:98,105), so two blocks
// mounting together would each append a <script> and evaluate echarts twice
let loading: Promise<void> | undefined;
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { buildChartOption, readChartTheme } from "./chart-option";
import type { ChartBlock } from "../../types/blocks";
import type { ECharts } from "echarts/core";

const props = defineProps<{ block: ChartBlock }>();

const noData = __("No data available");

const canvas = ref<HTMLDivElement>();

const hasData = computed(() => {
	return props.block.data.datasets.length > 0 && props.block.data.labels.length > 0;
});

let chart: ECharts | undefined;
let resizes: ResizeObserver | undefined;

onMounted(async () => {
	if (!hasData.value || typeof frappe === "undefined" || !frappe.assets) return;
	// frappe.require() would put frappe.dom.freeze()'s backdrop over the whole desk while it loads
	// (assets.js:131); load_asset is the same loader without it
	const url = frappe.assets.bundled_asset("frappe_ai_chart.bundle.ts");
	// which hands the path straight back when assets.json has no entry for it (assets.js:150), and
	// load_asset has no handler for that extension
	if (!url.endsWith(".js")) return;
	await (loading ??= frappe.assets.load_asset(url, url));
	const echarts = window.frappe_ai_echarts;
	if (!echarts || !canvas.value) return;
	// zrender falls back to whatever painter happens to be registered when the renderer is left out
	// (zrender/lib/zrender.js:55-60); ask for the one this app registers
	chart = echarts.init(canvas.value, undefined, { renderer: "svg" });
	// read the theme once, here, so a live theme switch recolours only charts drawn after it
	chart.setOption(buildChartOption(props.block, readChartTheme()));
	// echarts' own throttle at the interval vue-echarts' :autoresize used, so dragging the panel's
	// edge relayouts at 10 Hz and not once a frame
	resizes = new ResizeObserver(echarts.throttle(() => chart?.resize(), 100));
	resizes.observe(canvas.value);
});

onBeforeUnmount(() => {
	resizes?.disconnect();
	chart?.dispose();
});
</script>

<template>
	<div class="frappe-ai-chart">
		<div v-if="block.title" class="frappe-ai-chart-title">{{ block.title }}</div>
		<div v-if="!hasData" class="frappe-ai-chart-empty">{{ noData }}</div>
		<div v-else ref="canvas" class="frappe-ai-chart-canvas"></div>
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
