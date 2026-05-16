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
					aria-label="Chat input"
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
				:aria-label="showStop ? 'Stop generating' : 'Send message'"
				@click="onButtonClick"
			>
				<span v-if="showStop" class="frappe-ai-stop-icon" aria-hidden="true"></span>
				<!-- `current-color` makes the arrow stroke follow the button's
				     `color` — without it, Frappe's icon symbol paints with a
				     hard-coded dark-gray stroke that disappears on the slate
				     `--ai-accent` background when the button is active. -->
				<!-- eslint-disable-next-line vue/no-v-html -->
				<span v-else v-html="frappeIcon('send-horizontal', 'sm', 'current-color')" />
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from "vue";
import { frappeIcon } from "../utils/frappe-icon";
import { useDraft } from "../composables/useDraft";

const props = defineProps<{
	/** An assistant turn is currently in flight. */
	busy: boolean;
	/** The in-flight turn can actually be cancelled. */
	canCancel: boolean;
}>();
const emit = defineEmits<{
	send: [content: string];
	stop: [];
}>();

const text = ref("");
const inputEl = ref<HTMLTextAreaElement>();

// NOTE-005: keep the textarea's unsent content across hard reloads.
// `useDraft` debounces writes and scopes by user.
const draft = useDraft();
onMounted(() => {
	text.value = draft.load();
});
watch(text, (v) => {
	draft.save(v);
});

/** Stop button is shown only when busy AND cancel is possible. */
const showStop = computed(() => props.busy && props.canCancel);

/**
 * Send button is disabled when:
 *   - busy but the turn can't be cancelled (no point in clicking)
 *   - idle but no text typed
 * It is enabled when:
 *   - showStop (so the user can click to abort)
 *   - idle with non-empty text
 */
const sendDisabled = computed(() => {
	if (showStop.value) return false;
	if (props.busy) return true;
	return !text.value.trim();
});

function onButtonClick() {
	if (showStop.value) {
		emit("stop");
		return;
	}
	if (props.busy) return;
	send();
}

function send() {
	const content = text.value.trim();
	if (!content) return;
	emit("send", content);
	text.value = "";
	// Clear the persisted draft immediately so a refresh between the send
	// and the assistant reply doesn't re-populate the textarea with what
	// the user just sent. The watch above would also fire (debounced), but
	// the explicit clear avoids the 500ms window of staleness.
	draft.clear();
	nextTick(() => {
		if (inputEl.value) inputEl.value.style.height = "auto";
	});
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		// Enter while busy is a no-op. We don't repurpose Enter to mean
		// "stop" — it's too easy to hit by accident while typing the
		// next message.
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
