<script setup lang="ts">
const emit = defineEmits<{
  clear: [];
  close: [];
}>();

/** Render a Frappe Lucide icon; falls back to inline SVG in dev mode. */
function frappeIcon(name: string, size: string): string {
  if (typeof frappe !== "undefined" && frappe.utils?.icon) {
    return frappe.utils.icon(name, size);
  }
  return `<svg class="icon icon-${size}"><use href="#icon-${name}"></use></svg>`;
}

declare const frappe: any;
</script>

<template>
  <div class="frappe-ai-header">
    <div class="frappe-ai-header-left">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <span v-html="frappeIcon('message-square-text', 'sm')" />
      <span class="frappe-ai-header-title">Frappe AI</span>
    </div>
    <div class="frappe-ai-header-actions">
      <button class="frappe-ai-icon-btn" title="New conversation" @click="emit('clear')">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="frappeIcon('rotate-ccw', 'sm')" />
      </button>
      <button class="frappe-ai-icon-btn" title="Close sidebar" @click="emit('close')">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="frappeIcon('x', 'sm')" />
      </button>
    </div>
  </div>
</template>
