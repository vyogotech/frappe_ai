<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../../utils/markdown";
import type { TextBlock } from "../../types/blocks";

const props = defineProps<{ block: TextBlock }>();

// this v-html is safe only while utils/markdown.ts keeps markdown-it's html: false
const rendered = computed(() => renderMarkdown(props.block.content || ""));
</script>

<template>
	<!-- eslint-disable-next-line vue/no-v-html -->
	<div class="frappe-ai-markdown" v-html="rendered"></div>
</template>
