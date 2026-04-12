<script setup lang="ts">
import { computed, ref, onErrorCaptured } from "vue";
import { getBlockComponent } from "./blocks";
import { renderMarkdown } from "@/utils/markdown";
import type { Message } from "@/types/messages";

const props = defineProps<{ message: Message }>();

const renderError = ref(false);

onErrorCaptured((err) => {
  console.error("[Copilot] Block render error:", err);
  renderError.value = true;
  return false;
});

const CRITICAL_CODES = ["AUTH_FAILURE", "ERPNEXT_DOWN"];
const WARNING_CODES = ["MCP_UNREACHABLE"];

const errorSeverity = computed(() => {
  if (props.message.role !== "error" || !props.message.error) return "";
  const code = props.message.error.code.toUpperCase();
  if (CRITICAL_CODES.includes(code)) return "critical";
  if (WARNING_CODES.includes(code)) return "warning";
  return "info";
});

const timeStr = computed(() =>
  props.message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
);
</script>

<template>
  <div :class="`frappe-ai-bubble frappe-ai-bubble--${message.role}`">
    <!-- User message -->
    <div v-if="message.role === 'user'" class="frappe-ai-bubble-content">
      {{ message.content }}
    </div>

    <!-- Assistant message -->
    <div v-else-if="message.role === 'assistant'" class="frappe-ai-bubble-content">
      <!-- Streaming: show status text while content is arriving -->
      <div v-if="message.metadata?.statusText && !message.content" class="frappe-ai-thinking">
        <span class="frappe-ai-thinking-dots" />
        {{ message.metadata.statusText }}
      </div>
      <div v-else-if="renderError" class="frappe-ai-error frappe-ai-error--info">
        <div class="frappe-ai-error-message">Could not render response</div>
      </div>
      <template v-else-if="message.blocks && message.blocks.length > 0">
        <component
          v-for="(block, i) in message.blocks"
          :key="i"
          :is="getBlockComponent(block.type)"
          :block="block"
        />
      </template>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else-if="message.content" class="frappe-ai-markdown" v-html="renderMarkdown(message.content)" />
    </div>

    <!-- Error message -->
    <div
      v-else-if="message.role === 'error'"
      :class="`frappe-ai-error frappe-ai-error--${errorSeverity}`"
    >
      <div class="frappe-ai-error-message">{{ message.error?.message }}</div>
      <div v-if="message.error?.suggestion" class="frappe-ai-error-suggestion">
        {{ message.error.suggestion }}
      </div>
    </div>

    <div class="frappe-ai-bubble-time">{{ timeStr }}</div>
  </div>
</template>
