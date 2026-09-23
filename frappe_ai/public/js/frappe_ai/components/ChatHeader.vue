<script setup lang="ts">
import { frappeIcon } from "../utils/frappe-icon";

const emit = defineEmits<{
	clear: [];
	close: [];
}>();

const appName = __("Frappe AI");
const newConversation = __("New conversation");
const closeSidebar = __("Close sidebar");
</script>

<template>
	<div class="frappe-ai-header">
		<div class="frappe-ai-header-left">
			<span class="frappe-ai-header-title">{{ appName }}</span>
		</div>
		<div class="frappe-ai-header-actions">
			<button
				class="frappe-ai-icon-btn"
				:title="newConversation"
				:aria-label="newConversation"
				@click="emit('clear')"
			>
				<!-- eslint-disable-next-line vue/no-v-html -->
				<span v-html="frappeIcon('rotate-ccw', 'sm')" />
			</button>
			<button
				class="frappe-ai-icon-btn"
				:title="closeSidebar"
				:aria-label="closeSidebar"
				@click="emit('close')"
			>
				<!-- eslint-disable-next-line vue/no-v-html -->
				<span v-html="frappeIcon('x', 'sm')" />
			</button>
		</div>
	</div>
</template>
