<script setup lang="ts">
import { ref, computed } from "vue";
import { formatValue } from "@/utils/formatters";
import type { TableBlock, TableRow } from "@/types/blocks";


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
            <th v-for="col in block.columns" :key="col.key" @click="toggleSort(col.key)">
              {{ col.label }}
              <span v-if="sortKey === col.key">{{ sortAsc ? "\u2191" : "\u2193" }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in sortedRows" :key="i"
              :class="{ 'frappe-ai-table-clickable': !!row.route }"
              @click="navigate(row)">
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
.frappe-ai-table-scroll {
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.frappe-ai-table-scroll table {
  min-width: 100%;
}
</style>
