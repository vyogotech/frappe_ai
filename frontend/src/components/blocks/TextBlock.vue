<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type { TextBlock } from "@/types/blocks";

const props = defineProps<{ block: TextBlock }>();

// Single shared instance — not per-component mount
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const defaultRender =
  md.renderer.rules.link_open ||
  function (
    tokens: Token[],
    idx: number,
    options: MarkdownItOptions,
    _env: unknown,
    self: Renderer,
  ) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (
  tokens: Token[],
  idx: number,
  options: MarkdownItOptions,
  env: unknown,
  self: Renderer,
) {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener");
  return defaultRender(tokens, idx, options, env, self);
};

const rendered = computed(() => md.render(props.block.content || ""));
</script>

<template>
  <div class="frappe-ai-markdown" v-html="rendered"></div>
</template>
