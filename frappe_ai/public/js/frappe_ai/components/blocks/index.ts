/** Block type to component, all imported eagerly: Frappe's esbuild emits no chunk for a dynamic import(). */

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
