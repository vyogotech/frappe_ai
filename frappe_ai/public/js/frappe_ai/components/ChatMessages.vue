<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import MessageBubble from "./MessageBubble.vue";
import ToolCallCard from "./ToolCallCard.vue";
import { frappeIcon } from "../utils/frappe-icon";
import type { Message } from "../types/messages";

const props = defineProps<{
	messages: readonly Message[];
}>();

const container = ref<HTMLElement>();

// Scroll-to-bottom triggers on (a) a new bubble appearing and (b) the
// last bubble's content changing as chunks arrive. Watching just
// `messages.length` and the last item's `content` is cheaper than the
// previous deep watch over the whole array — deep traversal was O(N)
// per chunk while the assistant message was being typed.
watch(
	[
		() => props.messages.length,
		() => props.messages[props.messages.length - 1]?.content,
	],
	() => {
		nextTick(() => {
			if (container.value) {
				container.value.scrollTop = container.value.scrollHeight;
			}
		});
	},
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
	</div>
</template>
