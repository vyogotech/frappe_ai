import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// vitest runs with the repo root as its cwd (vitest.config.ts sits there)
const css = readFileSync("frappe_ai/public/css/frappe_ai_sidebar.bundle.css", "utf8");
const reduceAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
const reduce = reduceAt === -1 ? "" : css.slice(reduceAt);
const rest = reduceAt === -1 ? css : css.slice(0, reduceAt);

/** Every selector in `rest` whose declarations animate, move or smooth-scroll something. */
function movingSelectors(): string[] {
	const flat = rest
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/@keyframes[^{]*\{[\s\S]*?\n\}/g, "")
		.replace(/@media[^{]*\{/g, "");
	return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.filter(([, , body]) => /\b(animation|transition|scroll-behavior)\b\s*[-:]/.test(body))
		.flatMap(([, sel]) => sel.split(",").map((s) => s.trim()))
		.filter(Boolean);
}

describe("the sidebar's motion", () => {
	it("is switched off for a reader who asked for less of it", () => {
		expect(reduce).toContain("animation-duration: 0.01ms");
		expect(reduce).toContain("animation-iteration-count: 1");
		expect(reduce).toContain("transition-duration: 0.01ms");
		expect(reduce).toContain("scroll-behavior: auto");
		expect(reduce).toContain("#frappe-ai-sidebar-root");
		expect(reduce).toContain("#frappe-ai-sidebar-root *");
	});

	it("declares no motion outside the subtree that block covers", () => {
		const selectors = movingSelectors();
		expect(selectors.length).toBeGreaterThan(5);
		for (const sel of selectors) {
			expect(sel).toMatch(/^(#frappe-ai-sidebar-root|\.frappe-ai-)/);
		}
	});
});
