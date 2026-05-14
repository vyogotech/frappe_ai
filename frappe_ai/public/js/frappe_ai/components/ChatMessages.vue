<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from "vue";
import MessageBubble from "./MessageBubble.vue";
import ToolCallCard from "./ToolCallCard.vue";
import { frappeIcon } from "../utils/frappe-icon";
import { getPageContext } from "../utils/context";
import type { Message } from "../types/messages";

const props = defineProps<{
	messages: readonly Message[];
}>();

const emit = defineEmits<{
	send: [content: string];
}>();

const container = ref<HTMLElement>();

// Bumped whenever Frappe announces a route change so `starterPrompts`
// re-evaluates with the freshly-loaded `cur_frm`. Without this, the first
// chip on a form view shows the generic fallback because getPageContext()
// runs once at sidebar-mount time (before any form has loaded) and Vue
// has no signal that the page context has since changed.
const routeTick = ref(0);
const onRouteChange = () => {
	routeTick.value++;
};

onMounted(() => {
	// frappe.router.on("change", ...) is the v16 Desk hook for SPA navigation.
	// Guard against frappe being undefined (server-rendered/test env).
	if (typeof frappe !== "undefined" && frappe?.router?.on) {
		frappe.router.on("change", onRouteChange);
	}
});

onUnmounted(() => {
	if (typeof frappe !== "undefined" && frappe?.router?.off) {
		frappe.router.off("change", onRouteChange);
	}
});

// Three starter prompts shown on the empty state. The first is route-aware:
// on a doctype form we offer to summarise the bound document; everywhere else
// we fall back to a generic "What can you do?" so the chip stays useful.
const starterPrompts = computed<string[]>(() => {
	// Touch routeTick so the computed re-runs on every SPA navigation.
	// `void` keeps the lint/tsc clean about the unused read.
	void routeTick.value;
	const ctx = getPageContext();
	const onForm = ctx.doctype && ctx.docname;
	const first = onForm ? `Summarise this ${ctx.doctype}` : "What can you do?";
	return [first, "Show open invoices over 30 days", "List my top 5 customers by revenue"];
});

function pickPrompt(text: string) {
	emit("send", text);
}

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
			<h2 class="frappe-ai-empty-title">How can I help?</h2>
			<p class="frappe-ai-empty-subtitle">
				Ask me anything about your ERPNext data, or let me help you with tasks.
			</p>
			<div class="frappe-ai-starter-prompts">
				<button
					v-for="prompt in starterPrompts"
					:key="prompt"
					type="button"
					class="frappe-ai-starter-chip"
					@click="pickPrompt(prompt)"
				>
					{{ prompt }}
				</button>
			</div>
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
