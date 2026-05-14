<script setup lang="ts">
import { onMounted } from "vue";
import { useChat } from "../composables/useChat";
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
	cancelMessage,
	clearMessages,
	loadRecentConversation,
} = useChat();

// Hydrate from server-side history on first mount so a page reload doesn't
// erase the user's last chat. Failures are swallowed in the composable.
onMounted(() => {
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
</script>

<template>
	<div class="frappe-ai-sidebar" :style="{ width: sidebarWidth + 'px' }">
		<ChatHeader @clear="handleClear" @close="handleClose" />
		<ChatMessages :messages="messages" @send="handleSend" />
		<ChatInput
			:busy="isLoading"
			:can-cancel="canCancel"
			@send="handleSend"
			@stop="handleStop"
		/>
	</div>
</template>
