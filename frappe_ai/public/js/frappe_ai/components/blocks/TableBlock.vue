<script setup lang="ts">
import { ref, computed } from "vue";
import { formatValue } from "../../utils/formatters";
import type { TableBlock, TableRow } from "../../types/blocks";

const props = defineProps<{ block: TableBlock }>();

const sortKey = ref("");
const sortAsc = ref(true);

const sortedRows = computed(() => {
	if (!sortKey.value) return props.block.rows;
	const key = sortKey.value;
	const dir = sortAsc.value ? 1 : -1;
	return [...props.block.rows].sort((a, b) => {
		const va = a.values[key];
		const vb = b.values[key];
		if (va == null) return 1;
		if (vb == null) return -1;
		if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
		return String(va).localeCompare(String(vb)) * dir;
	});
});

function toggleSort(key: string) {
	if (sortKey.value === key) {
		sortAsc.value = !sortAsc.value;
	} else {
		sortKey.value = key;
		sortAsc.value = true;
	}
}

function navigate(row: TableRow) {
	if (row.route && typeof frappe !== "undefined") {
		frappe.set_route("Form", row.route.doctype, row.route.name);
	}
}
</script>

<template>
	<div class="frappe-ai-table">
		<div v-if="block.title" class="frappe-ai-table-title">{{ block.title }}</div>
		<div v-if="block.rows.length === 0" class="frappe-ai-table-empty">No data available</div>
		<div v-else class="frappe-ai-table-scroll">
			<table>
				<thead>
					<tr>
						<th
							v-for="col in block.columns"
							:key="col.key"
							@click="toggleSort(col.key)"
						>
							{{ col.label }}
							<span v-if="sortKey === col.key">{{
								sortAsc ? "\u2191" : "\u2193"
							}}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(row, i) in sortedRows"
						:key="i"
						:class="{ 'frappe-ai-table-clickable': !!row.route }"
						@click="navigate(row)"
					>
						<td v-for="col in block.columns" :key="col.key">
							{{ formatValue(row.values[col.key], col.format) }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style scoped>
.frappe-ai-table {
	margin: 8px 0;
	font-size: 12px;
	color: var(--text-color, #1f272e);
}
.frappe-ai-table-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 6px;
	color: var(--text-color, #1f272e);
}
.frappe-ai-table-empty {
	padding: 12px;
	text-align: center;
	color: var(--text-muted, #8d99a6);
	font-style: italic;
	border: 1px dashed var(--border-color, #e2e6e9);
	border-radius: 6px;
}
.frappe-ai-table-scroll {
	overflow-x: auto;
	max-width: 100%;
	-webkit-overflow-scrolling: touch;
	border: 1px solid var(--border-color, #e2e6e9);
	border-radius: 6px;
}
.frappe-ai-table-scroll table {
	width: 100%;
	min-width: 100%;
	border-collapse: collapse;
	background: var(--bg-color, #fff);
}
.frappe-ai-table-scroll thead th {
	background: var(--bg-light-gray, #f4f5f6);
	color: var(--text-muted, #525c66);
	font-weight: 600;
	text-align: left;
	padding: 6px 10px;
	border-bottom: 1px solid var(--border-color, #e2e6e9);
	white-space: nowrap;
	cursor: pointer;
	user-select: none;
}
.frappe-ai-table-scroll thead th:hover {
	background: var(--bg-gray, #ebedef);
}
.frappe-ai-table-scroll tbody td {
	padding: 6px 10px;
	border-bottom: 1px solid var(--border-color, #f0f1f2);
	vertical-align: middle;
	white-space: nowrap;
}
/* The sidebar is narrow (~380px); let the horizontal scroller carry overflow
   rather than vertically-stacked, character-by-character word-break which
   makes cells unreadable. */
.frappe-ai-table-scroll {
	scrollbar-width: thin;
}
.frappe-ai-table-scroll tbody tr:last-child td {
	border-bottom: none;
}
.frappe-ai-table-scroll tbody tr:nth-child(even) {
	background: var(--bg-light-gray, #fafbfc);
}
.frappe-ai-table-clickable {
	cursor: pointer;
}
.frappe-ai-table-clickable:hover td {
	background: var(--bg-blue-light, #e7f1fe);
}
</style>
