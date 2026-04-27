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
  props.message.timestamp
    ? props.message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "",
);

const isPendingEmpty = computed(
  () =>
    props.message.role === "assistant" &&
    !!props.message.pending &&
    !props.message.content &&
    (!props.message.blocks || props.message.blocks.length === 0) &&
    (!props.message.parts || props.message.parts.length === 0),
);
</script>

<template>
  <div :class="`frappe-ai-bubble frappe-ai-bubble--${message.role}`">
    <!-- User message -->
    <div v-if="message.role === 'user'" class="frappe-ai-bubble-content">
      {{ message.content }}
    </div>

    <!-- Assistant message. When pending and still empty, show the
         in-bubble "Thinking…" / contextual-status block. As soon as
         content or blocks arrive, fall through to the normal render
         paths. -->
    <div v-else-if="message.role === 'assistant'" class="frappe-ai-bubble-content">
      <div v-if="renderError" class="frappe-ai-error frappe-ai-error--info">
        <div class="frappe-ai-error-message">Could not render response</div>
      </div>
      <template v-else-if="isPendingEmpty">
        <div class="frappe-ai-bubble-status">
          <span class="frappe-ai-bubble-status-dot"></span>
          <span class="frappe-ai-bubble-status-dot"></span>
          <span class="frappe-ai-bubble-status-dot"></span>
          <span
            v-if="message.metadata?.statusText"
            class="frappe-ai-bubble-status-text"
          >
            {{ message.metadata.statusText }}
          </span>
        </div>
      </template>
      <template v-else>
        <!-- Parts-based rendering: preserves the interleaved arrival order
             of text tokens and structured blocks. Falls back to legacy
             content+blocks rendering when parts is absent or empty (e.g.
             non-SSE fallback messages or persisted history). -->
        <template v-if="message.parts && message.parts.length > 0">
          <template v-for="(part, i) in message.parts" :key="i">
            <!-- Text part — rendered as markdown -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              v-if="part.kind === 'text'"
              class="frappe-ai-markdown"
              v-html="renderMarkdown(part.text)"
            />
            <!-- Block part — rendered via the block component registry -->
            <component
              v-else-if="part.kind === 'block'"
              :is="getBlockComponent(part.block.type)"
              :block="part.block"
            />
          </template>
        </template>
        <template v-else>
          <!-- Legacy path: used when parts is absent (fallback / persisted
               history). Streamed prose before blocks. The agent's
               BlockStreamSplitter holds back `<ai-block>` markup so this
               path never renders raw HTML; markdown tables, lists, code,
               and prose all flow through here. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-if="message.content"
            class="frappe-ai-markdown"
            v-html="renderMarkdown(message.content)"
          />
          <!-- Structured blocks (KPI cards, charts, tables-as-data, status
               lists). Appended after content because the agent emits them
               as discrete events once their `<ai-block>` markup is complete. -->
          <template v-if="message.blocks && message.blocks.length > 0">
            <component
              v-for="(block, i) in message.blocks"
              :key="i"
              :is="getBlockComponent(block.type)"
              :block="block"
            />
          </template>
        </template>
      </template>
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

    <div v-if="!isPendingEmpty && message.timestamp" class="frappe-ai-bubble-time">{{ timeStr }}</div>
  </div>
</template>

<style scoped>
/* Constrain everything inside the assistant bubble to the sidebar width.
   Markdown-rendered tables (and other v-html content) can have intrinsic
   widths that push their container past the sidebar edge. Make the
   .frappe-ai-markdown wrapper itself the horizontal-scroll container so
   even wide tables, pre/code blocks, and images stay inside the bubble.
   :deep() is required because v-html content is not covered by Vue's
   scoped style transformer. */
.frappe-ai-markdown {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.frappe-ai-markdown :deep(table) {
  display: table;
  width: max-content;
  max-width: 100%;
  border-collapse: collapse;
}
.frappe-ai-markdown :deep(pre),
.frappe-ai-markdown :deep(img),
.frappe-ai-markdown :deep(svg) {
  max-width: 100%;
}
/* Make sure the bubble itself can't be widened by its children. */
.frappe-ai-bubble-content {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
</style>
