<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart, LineChart, PieChart, FunnelChart, HeatmapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
} from "echarts/components";
import VChart from "vue-echarts";
import { formatValue } from "@/utils/formatters";
import type { ChartBlock } from "@/types/blocks";

use([
  CanvasRenderer,
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

const chartOption = computed(() => {
  const { chart_type, data, options } = props.block;
  const currency = options?.currency;

  if (chart_type === "pie" || chart_type === "funnel") {
    const items = data.labels.map((label, i) => ({
      name: label,
      value: data.datasets[0]?.values[i] ?? 0,
    }));

    if (chart_type === "pie") {
      return {
        tooltip: {
          trigger: "item",
          formatter: (p: { name: string; value: number }) =>
            `${p.name}: ${formatValue(p.value, currency ? "currency" : "number", { currency })}`,
        },
        legend: { orient: "vertical", left: "left" },
        series: [{ type: "pie", radius: "60%", data: items }],
      };
    }

    return {
      tooltip: { trigger: "item" },
      legend: { orient: "vertical", left: "left" },
      series: [{ type: "funnel", data: items }],
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
      tooltip: { position: "top" },
      grid: { height: "60%", top: "10%" },
      xAxis: { type: "category", data: data.labels },
      yAxis: {
        type: "category",
        data: data.datasets.map((ds) => ds.name),
      },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: "5%",
      },
      series: [{ type: "heatmap", data: heatData, label: { show: true } }],
    };
  }

  if (chart_type === "calendar") {
    const calData = data.labels.map((label, i) => [
      label,
      data.datasets[0]?.values[i] ?? 0,
    ]);
    const year = data.labels[0]?.slice(0, 4) || new Date().getFullYear().toString();

    return {
      tooltip: { position: "top" },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: "5%",
      },
      calendar: { range: year },
      series: [{ type: "heatmap", coordinateSystem: "calendar", data: calData }],
    };
  }

  // Bar and Line (cartesian)
  const series = data.datasets.map((ds) => ({
    name: ds.name,
    type: chart_type,
    data: ds.values,
    stack: options?.stacked ? "total" : undefined,
  }));

  return {
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) =>
        formatValue(v, currency ? "currency" : "number", { currency }),
    },
    legend: { data: data.datasets.map((ds) => ds.name) },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "category", data: data.labels },
    yAxis: { type: "value" },
    series,
  };
});
</script>

<template>
  <div class="frappe-ai-chart">
    <div v-if="block.title" class="frappe-ai-chart-title">{{ block.title }}</div>
    <div v-if="!hasData" class="frappe-ai-chart-empty">No data available</div>
    <VChart v-else :option="chartOption" :autoresize="true" style="height: 300px; width: 100%" />
  </div>
</template>

<style scoped>
.frappe-ai-chart {
  max-width: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
