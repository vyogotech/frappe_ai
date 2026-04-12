<template>
  <div class="frappe-ai-input-area">
    <div class="frappe-ai-input-row">
      <div class="frappe-ai-input-wrapper">
        <textarea
          ref="inputEl"
          v-model="text"
          :disabled="disabled"
          class="frappe-ai-textarea"
          rows="1"
          placeholder="Ask anything..."
          @keydown="handleKeydown"
          @input="autoResize"
        />
      </div>
      <button
        :disabled="disabled || !text.trim()"
        :class="['frappe-ai-send-btn', text.trim() ? 'frappe-ai-send-btn--active' : '']"
        title="Send message"
        @click="send"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="frappeIcon('send-horizontal', 'sm')" />
      </button>
    </div>
    <p v-if="disabled" class="frappe-ai-input-hint">Connecting to agent...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";

declare const frappe: any;

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ send: [content: string] }>();

const text = ref("");
const inputEl = ref<HTMLTextAreaElement>();

function frappeIcon(name: string, size: string): string {
  if (typeof frappe !== "undefined" && frappe.utils?.icon) {
    return frappe.utils.icon(name, size);
  }
  return `<svg class="icon icon-${size}"><use href="#icon-${name}"></use></svg>`;
}

function send() {
  const content = text.value.trim();
  if (!content) return;
  emit("send", content);
  text.value = "";
  nextTick(() => {
    if (inputEl.value) inputEl.value.style.height = "auto";
  });
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}
</script>
