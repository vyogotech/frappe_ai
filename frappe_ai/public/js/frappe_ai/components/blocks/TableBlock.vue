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

function sortState(key: string): "ascending" | "descending" | undefined {
	if (sortKey.value !== key) return undefined;
	return sortAsc.value ? "ascending" : "descending";
}

const firstKey = computed(() => props.block.columns[0]?.key);

const noData = __("No data available");

/** The desk address of a row's document, so the cell can be a real link. */
function formLink(row: TableRow): string {
	if (!row.route || typeof frappe === "undefined") return "";
	return frappe.utils.get_form_link?.(row.route.doctype, row.route.name) ?? "";
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
		<div v-if="block.rows.length === 0" class="frappe-ai-table-empty">{{ noData }}</div>
		<div v-else class="frappe-ai-table-scroll">
			<table>
				<thead>
					<tr>
						<th
							v-for="col in block.columns"
							:key="col.key"
							:aria-sort="sortState(col.key)"
							@click="toggleSort(col.key)"
						>
							<button type="button" class="frappe-ai-table-sort">
								{{ col.label }}
								<span v-if="sortKey === col.key" aria-hidden="true">{{
									sortAsc ? "\u2191" : "\u2193"
								}}</span>
							</button>
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
							<!-- href is what makes this a link: without one the cell is neither focusable nor a link -->
							<a
								v-if="row.route && col.key === firstKey"
								:href="formLink(row)"
								class="frappe-ai-table-link"
								@click.prevent.stop="navigate(row)"
								>{{ formatValue(row.values[col.key], col.format) }}</a
							>
							<template v-else>{{
								formatValue(row.values[col.key], col.format)
							}}</template>
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
	color: var(--text-color);
}
.frappe-ai-table-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 6px;
	color: var(--text-color);
}
.frappe-ai-table-empty {
	padding: 12px;
	text-align: center;
	color: var(--text-muted);
	font-style: italic;
	border: 1px dashed var(--border-color);
	border-radius: 6px;
}
.frappe-ai-table-scroll {
	overflow-x: auto;
	max-width: 100%;
	-webkit-overflow-scrolling: touch;
	border: 1px solid var(--border-color);
	border-radius: 6px;
	scrollbar-width: thin;
}
.frappe-ai-table-scroll table {
	width: 100%;
	min-width: 100%;
	border-collapse: collapse;
	background: var(--bg-color);
}
.frappe-ai-table-scroll thead th {
	background: var(--bg-light-gray);
	color: var(--text-muted);
	font-weight: 600;
	text-align: left;
	/* the sort button carries the cell's padding, so it fills the header and the
	   whole cell stays one click target (APG sortable table) */
	padding: 0;
	border-bottom: 1px solid var(--border-color);
	white-space: nowrap;
	cursor: pointer;
	user-select: none;
}
.frappe-ai-table-scroll thead th:hover {
	background: var(--bg-gray);
}
.frappe-ai-table-sort {
	display: block;
	width: 100%;
	padding: 6px 10px;
	font: inherit;
	color: inherit;
	text-align: inherit;
	background: none;
	border: 0;
	cursor: inherit;
}
.frappe-ai-table-scroll tbody td {
	padding: 6px 10px;
	border-bottom: 1px solid var(--border-color);
	vertical-align: middle;
	white-space: nowrap;
}
/* The sidebar is narrow (~380px); let the horizontal scroller carry overflow
   rather than vertically-stacked, character-by-character word-break which
   makes cells unreadable. */
.frappe-ai-table-scroll tbody tr:last-child td {
	border-bottom: none;
}
.frappe-ai-table-scroll tbody tr:nth-child(even) {
	background: var(--bg-light-gray);
}
/* the row already carries the design for "this opens a record"; the link is there for
   the keyboard and the accessibility tree, and must not repaint its cell */
.frappe-ai-table-link,
.frappe-ai-table-link:hover {
	color: inherit;
	text-decoration: none;
}
.frappe-ai-table-clickable {
	cursor: pointer;
}
.frappe-ai-table-clickable:hover td {
	background: var(--bg-blue-light);
}
</style>
