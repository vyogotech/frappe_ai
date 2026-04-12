<script setup lang="ts">
import { useChat } from "@/composables/useChat";
import ChatHeader from "./ChatHeader.vue";
import ChatMessages from "./ChatMessages.vue";
import ChatInput from "./ChatInput.vue";

const props = defineProps<{
  sidebarWidth: number;
  keyboardShortcut: string;
  visible: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const { messages, isLoading, sendMessage, clearMessages } = useChat();

function handleSend(content: string) {
  sendMessage(content);
}

function handleClear() {
  clearMessages();
}

function handleClose() {
  emit("close");
}
</script>

<template>
  <div
    v-if="visible"
    class="frappe-ai-sidebar"
    :style="{ width: sidebarWidth + 'px' }"
  >
    <ChatHeader
      :is-loading="isLoading"
      @clear="handleClear"
      @close="handleClose"
    />
    <ChatMessages :messages="messages" :is-streaming="isLoading" />
    <ChatInput
      :disabled="isLoading"
      @send="handleSend"
    />
  </div>
</template>
