/** Shared markdown-to-HTML renderer backed by markdown-it.
 *
 * Used by MessageBubble for plain-text assistant responses (the agent's
 * BlockStreamSplitter keeps `<ai-block>` markup out of the stream that
 * reaches here). Supports the common commonmark surface plus GFM-style
 * pipe tables and task lists.
 *
 * Structured responses (charts, KPIs, typed tables) arrive as separate
 * `content_block` chunks from the agent and render via the components in
 * components/blocks/ — not through this renderer.
 */

import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

// Open all rendered links in a new tab so the sidebar doesn't navigate away.
// We forward params to the original rule by inferring its signature instead
// of importing `Token` / `Renderer` from subpaths (`@types/markdown-it`
// exposes them only as namespace members, not as separate modules).
type LinkOpenRule = NonNullable<typeof md.renderer.rules.link_open>;
const defaultLinkOpen: LinkOpenRule =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(text: string): string {
  if (!text) return "";
  return md.render(text);
}
