<template>
  <div class="frappe-ai-input-area">
    <div class="frappe-ai-input-row">
      <div class="frappe-ai-input-wrapper">
        <textarea
          ref="inputEl"
          v-model="text"
          class="frappe-ai-textarea"
          rows="1"
          placeholder="Ask anything..."
          @keydown="handleKeydown"
          @input="autoResize"
        />
      </div>
      <button
        :class="[
          'frappe-ai-send-btn',
          showStop
            ? 'frappe-ai-send-btn--stop'
            : text.trim()
            ? 'frappe-ai-send-btn--active'
            : '',
        ]"
        :disabled="sendDisabled"
        :title="showStop ? 'Stop generating' : 'Send message'"
        @click="onButtonClick"
      >
        <span v-if="showStop" class="frappe-ai-stop-icon" aria-hidden="true"></span>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-else v-html="frappeIcon('send-horizontal', 'sm')" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";


const props = defineProps<{
  /** An assistant turn is currently in flight (SSE or fallback). */
  busy: boolean;
  /** The in-flight turn can actually be cancelled (SSE path only). */
  canCancel: boolean;
}>();
const emit = defineEmits<{
  send: [content: string];
  stop: [];
}>();

const text = ref("");
const inputEl = ref<HTMLTextAreaElement>();

/** Stop button is shown only when busy AND cancel is possible. */
const showStop = computed(() => props.busy && props.canCancel);

/**
 * Send button is disabled when:
 *   - busy in fallback mode (can't cancel, can't queue)  — spec says "stays as Send and is disabled"
 *   - idle but no text typed
 * It is enabled when:
 *   - showStop (so the user can click to abort)
 *   - idle with non-empty text
 */
const sendDisabled = computed(() => {
  if (showStop.value) return false;
  if (props.busy) return true; // fallback busy: disabled Send
  return !text.value.trim();
});

function frappeIcon(name: string, size: string): string {
  if (typeof frappe !== "undefined" && frappe.utils?.icon) {
    return frappe.utils.icon(name, size);
  }
  return `<svg class="icon icon-${size}"><use href="#icon-${name}"></use></svg>`;
}

function onButtonClick() {
  if (showStop.value) {
    emit("stop");
    return;
  }
  if (props.busy) return; // fallback-busy click: no-op (button is also disabled)
  send();
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
    // Enter while busy is a no-op in either mode. We don't repurpose
    // Enter to mean "stop" because it's too easy to hit by accident
    // while typing the next message.
    if (!props.busy) send();
  }
}

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}
</script>
