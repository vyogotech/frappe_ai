<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import type { TextBlock } from "@/types/blocks";

const props = defineProps<{ block: TextBlock }>();

// Single shared instance — not per-component mount
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens: any, idx: any, options: any, _env: any, self: any) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens: any, idx: any, options: any, env: any, self: any) {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener");
  return defaultRender(tokens, idx, options, env, self);
};

const rendered = computed(() => md.render(props.block.content || ""));
</script>

<template>
  <div class="frappe-ai-markdown" v-html="rendered"></div>
</template>
