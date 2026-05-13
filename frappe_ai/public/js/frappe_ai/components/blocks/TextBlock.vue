<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../../utils/markdown";
import type { TextBlock } from "../../types/blocks";

const props = defineProps<{ block: TextBlock }>();

const rendered = computed(() => renderMarkdown(props.block.content || ""));
</script>

<template>
	<div class="frappe-ai-markdown" v-html="rendered"></div>
</template>
