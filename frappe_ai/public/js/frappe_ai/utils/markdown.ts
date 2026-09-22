/** The agent's prose to HTML. html: false is the only XSS guard here: never turn it on without a sanitiser. */

import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

// inferred, not imported: @types/markdown-it has Token and Renderer only as namespace members, not subpath modules
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
