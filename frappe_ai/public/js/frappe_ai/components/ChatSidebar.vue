<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
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

const panel = ref<HTMLElement>();
const input = ref<InstanceType<typeof ChatInput>>();
let opener: HTMLElement | null = null;
let isOpen = false;

// The panel is the last child of body (frappe_ai.bundle.ts), so without this a keyboard
// user would tab through the whole desk to reach it, and find no way back.
function onOpened() {
	isOpen = true;
	opener = document.activeElement as HTMLElement | null;
	// the panel is still display:none this tick; re-check, or a close before the flush would
	// pull focus back into a hidden composer
	nextTick(() => {
		if (isOpen) input.value?.focus();
	});
}

function onClosed() {
	isOpen = false;
	const el = opener;
	opener = null;
	if (!el) return;
	// v-show drops focus to body; anywhere else means the user has moved on, so leave them there
	const active = document.activeElement;
	if (active && active !== document.body && !panel.value?.contains(active)) return;
	el.focus();
}

// Hydrate from server-side history on first mount so a page reload doesn't
// erase the user's last chat.
onMounted(() => {
	// the sidebar is mounted with the defaults when the boot carried no settings (boot-decision.ts), so say so here
	if (loadError) showError("Connection failed");
	loadRecentConversation();
	document.addEventListener("frappe-ai-opened", onOpened);
	document.addEventListener("frappe-ai-closed", onClosed);
});

onUnmounted(() => {
	document.removeEventListener("frappe-ai-opened", onOpened);
	document.removeEventListener("frappe-ai-closed", onClosed);
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
	<!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- not a widget: the panel only catches an Escape bubbling up from the control that has focus (APG dialog) -->
	<aside
		ref="panel"
		class="frappe-ai-sidebar"
		aria-label="Frappe AI"
		:style="{ width: sidebarWidth + 'px' }"
		@keydown.esc="handleClose"
	>
		<ChatHeader @clear="handleClear" @close="handleClose" />
		<ChatMessages :messages="messages" @send="handleSend" @allow="allow" @deny="deny" />
		<ChatInput
			ref="input"
			:busy="isLoading"
			:can-cancel="canCancel"
			@send="handleSend"
			@stop="handleStop"
		/>
		<div class="sr-only" role="status">{{ liveStatus }}</div>
	</aside>
</template>
