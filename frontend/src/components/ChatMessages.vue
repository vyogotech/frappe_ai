<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import MessageBubble from "./MessageBubble.vue";
import ToolCallCard from "./ToolCallCard.vue";
import type { Message } from "@/types/messages";

declare const frappe: any;

function frappeIcon(name: string, size: string): string {
  if (typeof frappe !== "undefined" && frappe.utils?.icon) {
    return frappe.utils.icon(name, size);
  }
  return `<svg class="icon icon-${size}"><use href="#icon-${name}"></use></svg>`;
}

const props = defineProps<{
  messages: readonly Message[];
  isStreaming: boolean;
}>();

const container = ref<HTMLElement>();

watch(
  () => props.messages,
  () => {
    nextTick(() => {
      if (container.value) {
        container.value.scrollTop = container.value.scrollHeight;
      }
    });
  },
  { deep: true },
);
</script>

<template>
  <div ref="container" class="frappe-ai-messages">
    <div v-if="messages.length === 0" class="frappe-ai-empty-state">
      <div class="frappe-ai-empty-icon">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="frappeIcon('bot-message-square', 'md')" />
      </div>
      <p class="frappe-ai-empty-title">How can I help?</p>
      <p class="frappe-ai-empty-subtitle">
        Ask me anything about your ERPNext data, or let me help you with tasks.
      </p>
    </div>

    <template v-for="msg in messages" :key="msg.id">
      <ToolCallCard
        v-if="msg.role === 'tool_call' && msg.toolCall"
        :tool-call="msg.toolCall"
      />
      <MessageBubble v-else :message="msg" />
    </template>

    <div v-if="isStreaming" class="frappe-ai-streaming">
      <span class="frappe-ai-streaming-dot"></span>
      <span class="frappe-ai-streaming-dot"></span>
      <span class="frappe-ai-streaming-dot"></span>
    </div>
  </div>
</template>
