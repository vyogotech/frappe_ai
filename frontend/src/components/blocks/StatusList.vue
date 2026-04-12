<script setup lang="ts">
import type { StatusListBlock, StatusItem } from "@/types/blocks";

declare const frappe: any;

const props = defineProps<{ block: StatusListBlock }>();

function navigate(item: StatusItem) {
  if (item.route) {
    frappe.set_route("Form", item.route.doctype, item.route.name);
  }
}
</script>

<template>
  <div class="frappe-ai-status-list">
    <div v-if="block.title" class="frappe-ai-status-title">{{ block.title }}</div>
    <div v-for="(item, i) in block.items" :key="i"
         class="frappe-ai-status-item"
         :class="{ 'frappe-ai-status-clickable': !!item.route }"
         @click="navigate(item)">
      <span :class="`frappe-ai-status-dot frappe-ai-status-dot--${item.color}`"></span>
      <span class="frappe-ai-status-label">{{ item.label }}</span>
      <span :class="`frappe-ai-status-badge frappe-ai-status-badge--${item.color}`">{{ item.status }}</span>
    </div>
  </div>
</template>
