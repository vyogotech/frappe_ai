<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import ChatSidebar from "./components/ChatSidebar.vue";

const props = defineProps<{
  sidebarWidth: number;
  keyboardShortcut: string;
}>();

const visible = ref(false);

function toggle() {
  visible.value = !visible.value;
  document.dispatchEvent(
    new CustomEvent(visible.value ? "frappe-ai-opened" : "frappe-ai-closed"),
  );
}

function handleClose() {
  visible.value = false;
  document.dispatchEvent(new CustomEvent("frappe-ai-closed"));
}

onMounted(() => {
  document.addEventListener("frappe-ai-toggle", toggle);
});

onUnmounted(() => {
  document.removeEventListener("frappe-ai-toggle", toggle);
});
</script>

<template>
  <!-- v-show (not v-if) so the sidebar stays mounted across close/reopen.
       useChat() state — messages, in-flight SSE stream, AbortController —
       is in the ChatSidebar's setup scope; v-if would destroy it on close. -->
  <Transition name="frappe-ai-slide">
    <ChatSidebar
      v-show="visible"
      :sidebar-width="sidebarWidth"
      :keyboard-shortcut="keyboardShortcut"
      :visible="visible"
      @close="handleClose"
    />
  </Transition>
  <Transition name="frappe-ai-fade">
    <div v-show="visible" class="frappe-ai-overlay" @click="handleClose"></div>
  </Transition>
</template>
