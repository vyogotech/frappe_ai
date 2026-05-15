/** Block component registry — maps block type strings to Vue components.
 *
 *  Frappe's esbuild build doesn't emit a separate chunk for dynamic
 *  `import()`; the previous `defineAsyncComponent(() => import(...))`
 *  wrapper resolved to a loader that never produced output, so chart
 *  blocks silently rendered nothing while KPI/table/status_list (eager)
 *  worked. Eager-import ChartBlock to match — echarts is already inlined
 *  into the main bundle anyway, so there's no size win to recover.
 */

import type { Component } from "vue";
import type { BlockType } from "../../types/blocks";
import TextBlock from "./TextBlock.vue";
import TableBlock from "./TableBlock.vue";
import KPICards from "./KPICards.vue";
import StatusList from "./StatusList.vue";
import ChartBlock from "./ChartBlock.vue";

export const blockComponentMap: Record<BlockType, Component> = {
  text: TextBlock,
  chart: ChartBlock,
  table: TableBlock,
  kpi: KPICards,
  status_list: StatusList,
};

export function getBlockComponent(type: string): Component | undefined {
  return blockComponentMap[type as BlockType];
}
