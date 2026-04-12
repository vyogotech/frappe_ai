<script setup lang="ts">
import { formatValue } from "@/utils/formatters";
import type { KPIBlock, TrendDirection } from "@/types/blocks";

const props = defineProps<{ block: KPIBlock }>();

const trendArrows: Record<TrendDirection, string> = {
  up: "\u2191",
  down: "\u2193",
  flat: "\u2192",
};
</script>

<template>
  <div class="frappe-ai-kpi-container">
    <div v-for="(metric, i) in block.metrics" :key="i" class="frappe-ai-kpi-card">
      <div class="frappe-ai-kpi-label">{{ metric.label }}</div>
      <div class="frappe-ai-kpi-value">{{ formatValue(metric.value, metric.format) }}</div>
      <div v-if="metric.trend" :class="`frappe-ai-trend frappe-ai-trend--${metric.trend}`">
        <span class="frappe-ai-trend-arrow">{{ trendArrows[metric.trend] }}</span>
        <span v-if="metric.trend_value" class="frappe-ai-trend-value">{{ metric.trend_value }}</span>
      </div>
    </div>
  </div>
</template>
