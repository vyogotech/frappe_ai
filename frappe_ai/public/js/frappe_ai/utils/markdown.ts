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

type ImageRule = NonNullable<typeof md.renderer.rules.image>;
const defaultImage: ImageRule =
	md.renderer.rules.image ||
	((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

/** The src as this page resolves it — null when it is empty or not a URL at all. */
function resolveSrc(src: string): URL | null {
	try {
		return src ? new URL(src, window.location.href) : null;
	} catch {
		return null;
	}
}

/** markdown-it's own escaper: `&`, `<`, `>` and `"` as entities. */
export const esc = md.utils.escapeHtml;

md.renderer.rules.image = (tokens, idx, options, env, self) => {
	const url = resolveSrc(tokens[idx].attrGet("src") || "");
	// the src comes from the model: anything this site does not serve would fetch on render, with no
	// click, so only our own origin (which is what serves /files and /private/files) becomes an <img>
	if (url && url.origin === window.location.origin)
		return defaultImage(tokens, idx, options, env, self);
	const alt = esc(self.renderInlineAsText(tokens[idx].children || [], options, env));
	if (!url || (url.protocol !== "https:" && url.protocol !== "http:"))
		return `<span class="frappe-ai-noimage">${alt || "Image unavailable"}</span>`;
	return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${alt || "Image"}</a> (image on ${esc(url.host)})`;
};

export function renderMarkdown(text: string): string {
	if (!text) return "";
	return md.render(text);
}
