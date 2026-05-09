/** Shared markdown-to-HTML renderer backed by markdown-it.
 *
 * Used by MessageBubble for plain-text assistant responses (when the LLM
 * didn't wrap anything in <copilot-block> tags). Supports the common
 * commonmark surface plus GFM-style pipe tables and task lists.
 *
 * Structured responses (charts, KPIs, typed tables) flow through the
 * server-side block parser → content_block SSE events → the dedicated
 * block components in components/blocks/, not this renderer.
 */

import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

// Open all rendered links in a new tab so the sidebar doesn't navigate away.
const defaultLinkOpen =
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
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(text: string): string {
  if (!text) return "";
  return md.render(text);
}
