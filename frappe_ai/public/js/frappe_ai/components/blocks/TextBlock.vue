<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../../utils/markdown";
import type { TextBlock } from "../../types/blocks";

const props = defineProps<{ block: TextBlock }>();

// `renderMarkdown` runs markdown-it with `html: false`, which escapes
// any raw HTML in the agent's text instead of rendering it. That's the
// sole sanitization layer for this v-html; if anyone weakens that flag
// in utils/markdown.ts, this block becomes an XSS vector.
const rendered = computed(() => renderMarkdown(props.block.content || ""));
</script>

<template>
	<!-- eslint-disable-next-line vue/no-v-html -->
	<div class="frappe-ai-markdown" v-html="rendered"></div>
</template>
