import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("renders plain prose to a paragraph", () => {
    const out = renderMarkdown("hello world");
    expect(out).toContain("<p>");
    expect(out).toContain("hello world");
  });

  it("renders GFM-style pipe tables", () => {
    const out = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(out).toContain("<table>");
    expect(out).toContain("<th>a</th>");
    expect(out).toContain("<td>1</td>");
  });

  it("renders headings", () => {
    expect(renderMarkdown("# heading 1")).toContain("<h1>heading 1</h1>");
    expect(renderMarkdown("## heading 2")).toContain("<h2>heading 2</h2>");
  });

  it("renders inline code and code blocks", () => {
    expect(renderMarkdown("inline `x` here")).toContain("<code>x</code>");
    expect(renderMarkdown("```\nfoo\n```")).toMatch(/<pre><code>foo\n<\/code><\/pre>/);
  });

  it("renders lists", () => {
    const out = renderMarkdown("- one\n- two\n- three");
    expect(out).toContain("<ul>");
    expect(out).toMatch(/<li>one<\/li>/);
  });

  it("escapes raw HTML (html: false)", () => {
    // Critical XSS defence — the agent's output must not be able to inject
    // arbitrary HTML, even if it tries.
    const out = renderMarkdown('<script>alert("xss")</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("converts line breaks (breaks: true)", () => {
    // markdown-it `breaks: true` turns single newlines into <br>.
    const out = renderMarkdown("line one\nline two");
    expect(out).toContain("<br>");
  });

  it("opens external links in a new tab with secure rel", () => {
    const out = renderMarkdown("[click](https://example.com)");
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("https://example.com");
  });

  it("autolinks bare URLs (linkify: true)", () => {
    const out = renderMarkdown("see https://example.com for details");
    expect(out).toContain('href="https://example.com"');
  });

  it("renders typographic quotes (typographer: true)", () => {
    const out = renderMarkdown('"smart quotes"');
    // markdown-it converts straight quotes to typographic — at least one
    // curly quote should appear.
    expect(out).toMatch(/[“”]/);
  });

  it("handles task-list-style markup as a list (not a special class)", () => {
    // Vanilla markdown-it doesn't render checkboxes; we just want it to
    // not blow up and to render a list.
    const out = renderMarkdown("- [ ] todo\n- [x] done");
    expect(out).toContain("<ul>");
  });

  it("is idempotent on simple input", () => {
    const input = "hello";
    expect(renderMarkdown(input)).toBe(renderMarkdown(input));
  });
});
