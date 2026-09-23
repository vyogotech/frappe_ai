import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// vitest runs with the repo root as its cwd (vitest.config.ts sits there)
const css = readFileSync("frappe_ai/public/css/frappe_ai_sidebar.bundle.css", "utf8")
	.replace(/\/\*[\s\S]*?\*\//g, "")
	.replace(/@keyframes[^{]*\{[\s\S]*?\n\}/g, "")
	.replace(/@media[^{]*\{/g, "");

const bodies = new Map<string, string>();
for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
	for (const sel of selectors.split(",")) {
		const key = sel.trim();
		bodies.set(key, (bodies.get(key) ?? "") + ";" + body);
	}
}

/** The winning value of `prop` in `selector`, or undefined when it declares none. */
function decl(selector: string, prop: string): string | undefined {
	const hits = [
		...(bodies.get(selector) ?? "").matchAll(new RegExp(`;\\s*${prop}\\s*:([^;]+)`, "g")),
	];
	return hits.at(-1)?.[1].trim();
}

const ROOT = "#frappe-ai-sidebar-root";
const DARK_ROOT = `[data-theme="dark"] ${ROOT}`;

/** Frappe v16.34.0's own values for the tokens the sidebar paints on, from the tagged source:
    espresso/_colors.scss, espresso/_typography.scss, common/css_variables.scss, desk/dark.scss. */
const THEME = {
	light: { root: ROOT, bg: "#ffffff", row: "#f3f3f3", muted: "#525252" },
	dark: { root: DARK_ROOT, bg: "#171717", row: "#232323", muted: "#c7c7c7" },
};
type Theme = keyof typeof THEME;

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string): number[] => {
	expect(hex, "a measured colour must be a literal, not a var() the desk can repaint").toMatch(
		/^#[0-9a-f]{6}$/,
	);
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const luminance = (c: number[]) =>
	0.2126 * channel(c[0] / 255) + 0.7152 * channel(c[1] / 255) + 0.0722 * channel(c[2] / 255);
/** WCAG 2.2, https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio */
function ratio(fg: string, bg: string, alpha = 1): number {
	const back = rgb(bg);
	const front = rgb(fg).map((v, i) => v * alpha + back[i] * (1 - alpha));
	const [a, b] = [luminance(front), luminance(back)];
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A custom property off the sidebar root; the dark rule only redeclares some, so the rest
    keep the value of the less specific rule, and reading falls back the same way. */
const token = (theme: Theme, name: string) =>
	decl(THEME[theme].root, name) ?? decl(ROOT, name) ?? "";

const opacity = (selector: string) => Number(decl(selector, "opacity") ?? 1);

const HUES = ["green", "red", "yellow", "blue"] as const;
const THEMES = Object.keys(THEME) as Theme[];

describe.each(THEMES)("the sidebar's status colours, %s theme", (theme) => {
	const { bg, row, muted } = THEME[theme];

	it.each(HUES)("reads the %s chip at 4.5:1 (SC 1.4.3)", (hue) => {
		const sel = `.frappe-ai-status-badge--${hue}`;
		expect(ratio(decl(sel, "color")!, decl(sel, "background")!)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(HUES)("shows the %s dot at 3:1 against its row (SC 1.4.11)", (hue) => {
		const dot = decl(`.frappe-ai-status-dot--${hue}`, "background")!;
		expect(ratio(dot, row)).toBeGreaterThanOrEqual(3);
	});

	it("keeps the gray chip and dot, which follow the desk's tokens", () => {
		expect(ratio(muted, row)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(["up", "down"] as const)("reads the %s trend at 4.5:1", (direction) => {
		const colour = token(theme, `--ai-trend-${direction}`);
		// the arrow and the value are separate spans; either may carry an opacity
		expect(ratio(colour, bg, opacity(".frappe-ai-trend-arrow"))).toBeGreaterThanOrEqual(4.5);
		expect(ratio(colour, bg, opacity(".frappe-ai-trend-value"))).toBeGreaterThanOrEqual(4.5);
	});

	it("reads the error message and its suggestion at 4.5:1", () => {
		const ink = decl(".frappe-ai-error--info", "color")!;
		const paper = decl(".frappe-ai-error--info", "background")!;
		expect(ratio(ink, paper)).toBeGreaterThanOrEqual(4.5);
		expect(ratio(ink, paper, opacity(".frappe-ai-error-suggestion"))).toBeGreaterThanOrEqual(
			4.5,
		);
	});
});
