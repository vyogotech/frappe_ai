<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useChat } from "../composables/useChat";
import { readBootSettings } from "../utils/boot-settings";
import ChatHeader from "./ChatHeader.vue";
import ChatMessages from "./ChatMessages.vue";
import ChatInput from "./ChatInput.vue";

defineProps<{
	sidebarWidth: number;
	keyboardShortcut: string;
}>();

const emit = defineEmits<{ close: [] }>();

const {
	messages,
	isLoading,
	canCancel,
	sendMessage,
	allow,
	deny,
	cancelMessage,
	clearMessages,
	loadRecentConversation,
	showError,
} = useChat();

const { loadError } = readBootSettings();

// Hydrate from server-side history on first mount so a page reload doesn't
// erase the user's last chat.
onMounted(() => {
	// the sidebar is mounted with the defaults when the boot carried no settings (boot-decision.ts), so say so here
	if (loadError) showError("Connection failed");
	loadRecentConversation();
});

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

// SC 4.1.3: one polite region for the whole panel. It never carries a fragment of a
// streaming answer, only the three states a reader has to know about, and every word
// of it is already on screen.
const liveStatus = computed(() => {
	const last = messages.value[messages.value.length - 1];
	if (last?.role === "error") {
		return [last.error.message, last.error.suggestion].filter(Boolean).join(" ");
	}
	if (isLoading.value) return "Thinking...";
	// `parts` is set only on a message this tab streamed, so restoring the last chat on mount
	// does not read yesterday's answer out
	if (last?.role === "assistant" && !last.pending && last.parts) return last.content;
	return "";
});
</script>

<template>
	<div class="frappe-ai-sidebar" :style="{ width: sidebarWidth + 'px' }">
		<ChatHeader @clear="handleClear" @close="handleClose" />
		<ChatMessages :messages="messages" @send="handleSend" @allow="allow" @deny="deny" />
		<ChatInput
			:busy="isLoading"
			:can-cancel="canCancel"
			@send="handleSend"
			@stop="handleStop"
		/>
		<div class="sr-only" role="status">{{ liveStatus }}</div>
	</div>
</template>
