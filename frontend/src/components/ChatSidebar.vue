<script setup lang="ts">
import { useChat } from "@/composables/useChat";
import ChatHeader from "./ChatHeader.vue";
import ChatMessages from "./ChatMessages.vue";
import ChatInput from "./ChatInput.vue";

defineProps<{
  sidebarWidth: number;
  keyboardShortcut: string;
  visible: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const {
  messages,
  isLoading,
  canCancel,
  sendMessage,
  cancelMessage,
  clearMessages,
} = useChat();

function handleSend(content: string) {
  sendMessage(content);
}

function handleStop() {
  cancelMessage();
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
    v-show="visible"
    class="frappe-ai-sidebar"
    :style="{ width: sidebarWidth + 'px' }"
  >
    <ChatHeader @clear="handleClear" @close="handleClose" />
    <ChatMessages :messages="messages" />
    <ChatInput
      :busy="isLoading"
      :can-cancel="canCancel"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>
