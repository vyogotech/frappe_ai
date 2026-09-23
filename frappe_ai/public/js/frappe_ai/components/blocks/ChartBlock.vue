<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import "./chart-echarts";
import VChart from "vue-echarts";
import { buildChartOption, readChartTheme, type ChartTheme } from "./chart-option";
import type { ChartBlock } from "../../types/blocks";

const props = defineProps<{ block: ChartBlock }>();

const hasData = computed(() => {
	return props.block.data.datasets.length > 0 && props.block.data.labels.length > 0;
});

// ponytail: read once on mount, so a live theme switch recolours only charts drawn after it; watch data-theme if that matters
const theme = ref<ChartTheme>({
	textColor: "",
	textMuted: "",
	borderColor: "",
	cellBg: "",
	onFill: "",
	fontFamily: "",
	palette: [],
});

onMounted(() => {
	theme.value = readChartTheme();
});

const chartOption = computed(() => buildChartOption(props.block, theme.value));
</script>

<template>
	<div class="frappe-ai-chart">
		<div v-if="block.title" class="frappe-ai-chart-title">{{ block.title }}</div>
		<div v-if="!hasData" class="frappe-ai-chart-empty">No data available</div>
		<VChart v-else class="frappe-ai-chart-canvas" :option="chartOption" :autoresize="true" />
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
