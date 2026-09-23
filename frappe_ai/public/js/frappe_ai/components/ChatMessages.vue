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
	allow: [id: string];
	deny: [id: string];
}>();

const container = ref<HTMLElement>();

// SC 2.1.1: a scrolling list has no keyboard path of its own, so it takes a tab stop exactly while it
// scrolls — unconditional would put one in the desk's tab order at every size, with nothing to scroll to.
const scrolls = ref(false);
const messagesLabel = __("Chat messages");
let resizes: ResizeObserver | undefined;

function measure() {
	const el = container.value;
	scrolls.value = !!el && el.scrollHeight > el.clientHeight;
}

// getPageContext() is not reactive, so this tick is what re-evaluates starterPrompts after a route change
const routeTick = ref(0);
const onRouteChange = () => {
	routeTick.value++;
};

// the chat is hydrated while the panel is still hidden, where scrollHeight is 0 and the watcher's scroll is a no-op
const onSidebarOpened = () => scrollToNewest();

onMounted(() => {
	// frappe.router.on("change", ...) is the v16 Desk hook for SPA navigation.
	// Guard against frappe being undefined (server-rendered/test env).
	if (typeof frappe !== "undefined" && frappe?.router?.on) {
		frappe.router.on("change", onRouteChange);
	}
	document.addEventListener("frappe-ai-opened", onSidebarOpened);
	// zoom, a window resize and the composer growing all change the list's height without changing the
	// messages; observe() calls back once, which is the first measurement. Undefined in jsdom, like frappe.
	if (typeof ResizeObserver !== "undefined" && container.value) {
		resizes = new ResizeObserver(measure);
		resizes.observe(container.value);
	}
});

onUnmounted(() => {
	if (typeof frappe !== "undefined" && frappe?.router?.off) {
		frappe.router.off("change", onRouteChange);
	}
	document.removeEventListener("frappe-ai-opened", onSidebarOpened);
	resizes?.disconnect();
});

// Three starter prompts shown on the empty state. The first is route-aware:
// on a doctype form we offer to summarise the bound document; everywhere else
// we fall back to a generic "What can you do?" so the chip stays useful.
const starterPrompts = computed<string[]>(() => {
	// Touch routeTick so the computed re-runs on every SPA navigation.
	// `void` keeps the lint/tsc clean about the unused read.
	void routeTick.value;
	const ctx = getPageContext();
	const first =
		ctx.doctype && ctx.docname
			? __("Summarise this {0}", [ctx.doctype])
			: __("What can you do?");
	return [
		first,
		__("Show open invoices over 30 days"),
		__("List my top 5 customers by revenue"),
	];
});

const emptyTitle = __("How can I help?");
const emptySubtitle = __(
	"Ask me anything about your ERPNext data, or let me help you with tasks.",
);

function pickPrompt(text: string) {
	emit("send", text);
}

function scrollToNewest() {
	nextTick(() => {
		if (container.value) {
			container.value.scrollTop = container.value.scrollHeight;
		}
		// messages change the content's height, not the box's, so the observer stays quiet here
		measure();
	});
}

// length and the last content only: a deep watch walks the whole array on every chunk
watch(
	[() => props.messages.length, () => props.messages[props.messages.length - 1]?.content],
	scrollToNewest,
);
</script>

<template>
	<!-- a <section> maps to region only once it is named (HTML-AAM), so the landmark comes and goes with the stop -->
	<section
		ref="container"
		class="frappe-ai-messages"
		:tabindex="scrolls ? 0 : undefined"
		:aria-label="scrolls ? messagesLabel : undefined"
	>
		<div v-if="messages.length === 0" class="frappe-ai-empty-state">
			<div class="frappe-ai-empty-icon">
				<!-- eslint-disable-next-line vue/no-v-html -->
				<span v-html="frappeIcon('bot-message-square', 'md')" />
			</div>
			<h2 class="frappe-ai-empty-title">{{ emptyTitle }}</h2>
			<p class="frappe-ai-empty-subtitle">{{ emptySubtitle }}</p>
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
				@allow="emit('allow', $event)"
				@deny="emit('deny', $event)"
			/>
			<MessageBubble v-else :message="msg" />
		</template>
	</section>
</template>
