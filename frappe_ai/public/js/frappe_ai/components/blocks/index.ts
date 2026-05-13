/** Block component registry — maps block type strings to Vue components.
 *
 *  ChartBlock is lazy-loaded. echarts + its component imports add ~300KB
 *  gzipped to the bundle; users without chart blocks shouldn't pay that
 *  on every desk page-load. `defineAsyncComponent` defers the import
 *  until a chart block is actually rendered.
 *
 *  TextBlock, TableBlock, KPICards, StatusList stay eager — they're
 *  small and used on the first response of nearly every session.
 */

import { defineAsyncComponent, type Component } from "vue";
import type { BlockType } from "../../types/blocks";
import TextBlock from "./TextBlock.vue";
import TableBlock from "./TableBlock.vue";
import KPICards from "./KPICards.vue";
import StatusList from "./StatusList.vue";

const ChartBlock = defineAsyncComponent(() => import("./ChartBlock.vue"));

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
