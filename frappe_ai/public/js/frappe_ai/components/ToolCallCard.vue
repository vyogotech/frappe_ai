<template>
	<div class="frappe-ai-tool-card">
		<div v-if="confirming" class="frappe-ai-tool-header frappe-ai-tool-header--confirm">
			<button
				class="frappe-ai-tool-toggle"
				:aria-expanded="expanded"
				:aria-label="`${confirmLabel} ${expanded ? 'collapse' : 'expand'} details`"
				type="button"
				@click="expanded = !expanded"
			>
				<span
					class="frappe-ai-tool-status"
					:class="`frappe-ai-tool-status--${toolCall.status}`"
					aria-hidden="true"
				/>
				<span class="frappe-ai-tool-confirm-label">{{ confirmLabel }}</span>
			</button>
			<span v-if="toolCall.status === 'waiting'" class="frappe-ai-tool-actions">
				<button
					type="button"
					class="frappe-ai-tool-allow"
					@click="emit('allow', confirmId)"
				>
					Allow
				</button>
				<button type="button" class="frappe-ai-tool-deny" @click="emit('deny', confirmId)">
					Deny
				</button>
			</span>
		</div>
		<button
			v-else
			:class="['frappe-ai-tool-header', expanded ? 'frappe-ai-tool-header--open' : '']"
			:aria-expanded="expanded"
			:aria-label="`Tool call: ${toolCall.name}, ${expanded ? 'collapse' : 'expand'} details`"
			type="button"
			@click="expanded = !expanded"
		>
			<span
				class="frappe-ai-tool-status"
				:class="`frappe-ai-tool-status--${toolCall.status || 'running'}`"
				aria-hidden="true"
			/>
			<span class="frappe-ai-tool-name">{{ toolCall.name }}</span>
			<span class="frappe-ai-tool-time">{{ formattedTime }}</span>
			<!-- eslint-disable vue/no-v-html -- frappeIcon returns the desk's own <svg><use> markup -->
			<span
				class="frappe-ai-tool-chevron"
				aria-hidden="true"
				v-html="frappeIcon('chevron-right', 'xs')"
			/>
			<!-- eslint-enable vue/no-v-html -->
		</button>
		<div v-if="expanded">
			<div class="frappe-ai-tool-section">
				<p class="frappe-ai-tool-label">{{ confirming ? "Input" : "Arguments" }}</p>
				<pre class="frappe-ai-tool-pre">{{ formattedArgs }}</pre>
			</div>
			<div v-if="toolCall.result !== null && toolCall.result !== undefined">
				<button
					:class="[
						'frappe-ai-tool-expand-btn',
						resultExpanded ? 'frappe-ai-tool-expand-btn--open' : '',
					]"
					:aria-expanded="resultExpanded"
					:aria-label="`${resultExpanded ? 'Hide' : 'Show'} tool result`"
					type="button"
					@click.stop="resultExpanded = !resultExpanded"
				>
					<!-- eslint-disable vue/no-v-html -- frappeIcon returns the desk's own <svg><use> markup -->
					<span aria-hidden="true" v-html="frappeIcon('chevron-right', 'xs')" />
					<!-- eslint-enable vue/no-v-html -->
					Result
				</button>
				<div v-if="resultExpanded">
					<pre class="frappe-ai-tool-result-pre">{{ formattedResult }}</pre>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { frappeIcon } from "../utils/frappe-icon";
import type { ToolCall } from "../types/messages";

const props = defineProps<{ toolCall: ToolCall }>();
const emit = defineEmits<{ allow: [id: string]; deny: [id: string] }>();
const expanded = ref(false);
const resultExpanded = ref(false);

// only a card the server minted an id for can be answered; every other card keeps its ordinary header
const confirming = computed(
	() =>
		!!props.toolCall.confirm &&
		(props.toolCall.status === "waiting" || props.toolCall.status === "cancelled"),
);

// the id lives here, not in the template: frappe's esbuild parses a template expression as plain JavaScript,
// where TypeScript's `!` is a syntax error and the whole desk bundle fails to build
const confirmId = computed(() => props.toolCall.confirm?.id ?? "");

const confirmLabel = computed(() =>
	props.toolCall.status === "waiting"
		? `Allow ${props.toolCall.name}?`
		: `Denied ${props.toolCall.name}`,
);

const formattedArgs = computed(() => {
	if (!props.toolCall.arguments) return "{}";
	if (typeof props.toolCall.arguments === "string") return props.toolCall.arguments;
	try {
		return JSON.stringify(props.toolCall.arguments, null, 2);
	} catch {
		return String(props.toolCall.arguments);
	}
});

const formattedResult = computed(() => {
	const r = props.toolCall.result;
	if (r === null || r === undefined) return "";
	if (typeof r === "string") return r;
	try {
		return JSON.stringify(r, null, 2);
	} catch {
		return String(r);
	}
});

const formattedTime = computed(() => {
	const ts = props.toolCall.timestamp ?? new Date();
	return ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});
</script>
