/** Block component registry -- maps block type strings to Vue components. */

import type { Component } from "vue";
import type { BlockType } from "@/types/blocks";
import TextBlock from "./TextBlock.vue";
import ChartBlock from "./ChartBlock.vue";
import TableBlock from "./TableBlock.vue";
import KPICards from "./KPICards.vue";
import StatusList from "./StatusList.vue";

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
