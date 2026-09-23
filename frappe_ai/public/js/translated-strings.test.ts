import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "./frappe_ai/utils/markdown";

// The Translator role can write a Translation row (frappe v16.34.0 translation.json) and frappe's
// __() returns it verbatim (public/js/frappe/translate.js:17), so every __() result is untrusted
// input wherever it reaches markup.
const BREAKS_OUT_OF_AN_ATTRIBUTE = '" data-injected="yes';
const BREAKS_OUT_OF_AN_ELEMENT = '<em data-injected="yes">Frappe AI</em>';

const g = globalThis as Record<string, unknown>;
const frappeGlobal = g.frappe as Record<string, unknown>;
const bootDefaults = frappeGlobal.boot as Record<string, unknown>;

let appReady: (() => void) | undefined;
vi.stubGlobal("$", () => ({
	on: (_event: string, handler: () => void) => {
		appReady = handler;
	},
}));
vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		disconnect() {}
	},
);

const TOP_NAVBAR = '<nav><span class="desktop-avatar"></span></nav>';
const SIDEBAR = '<div class="dropdown-navbar-user"></div>';

/** Put `host` in the body. jsdom lays nothing out, so every offsetParent is null and the bundle's
    visible-avatar test never matches; give the avatar the one the browser would report. */
function desk(host: string): void {
	document.body.innerHTML = host;
	const avatar = document.querySelector(".desktop-avatar");
	if (avatar) Object.defineProperty(avatar, "offsetParent", { value: avatar.parentElement });
}

/** Run the bundle's app_ready handler against `host` and return the element it injected. */
async function boot(host: string, id: string): Promise<HTMLElement> {
	desk(host);
	vi.resetModules();
	await import("./frappe_ai.bundle");
	appReady?.();
	const el = document.getElementById(id);
	if (!el) throw new Error(`the bundle injected no #${id}`);
	return el;
}

/** Boot with every translated string replaced by `text`, and return the nav button. */
function bootWith(text: string, host: string): Promise<HTMLElement> {
	vi.stubGlobal("__", () => text);
	return boot(host, "frappe-ai-nav-btn");
}

beforeEach(() => {
	appReady = undefined;
	frappeGlobal.boot = bootDefaults;
	frappeGlobal.user_roles = [];
});

describe("a translated string in the navbar", () => {
	it.each([
		["the top-navbar button", TOP_NAVBAR],
		["the sidebar link", SIDEBAR],
	])("cannot add an attribute to %s through its title", async (_name, host) => {
		const btn = await bootWith(BREAKS_OUT_OF_AN_ATTRIBUTE, host);
		expect(btn.getAttribute("data-injected")).toBeNull();
		expect(btn.title).toBe(BREAKS_OUT_OF_AN_ATTRIBUTE);
	});

	it("cannot add an element to the sidebar link through its label", async () => {
		const btn = await bootWith(BREAKS_OUT_OF_AN_ELEMENT, SIDEBAR);
		expect(btn.querySelector("[data-injected]")).toBeNull();
		expect(btn.querySelector(".sidebar-item-label")?.textContent).toBe(
			BREAKS_OUT_OF_AN_ELEMENT,
		);
	});

	// the same attribute carries the configured shortcut; validate() already rejects one with a
	// quote in it (ai_assistant_settings.py:54), so this pins the property, not a live hole
	it("cannot add an attribute through the configured keyboard shortcut", async () => {
		vi.stubGlobal("__", (txt: string, replace?: string[]) =>
			replace ? txt.replace(/\{(\d+)\}/g, (m, i) => replace[+i] ?? m) : txt,
		);
		frappeGlobal.boot = {
			...bootDefaults,
			frappe_ai: { enabled: true, keyboard_shortcut: BREAKS_OUT_OF_AN_ATTRIBUTE },
		};
		const btn = await boot(TOP_NAVBAR, "frappe-ai-nav-btn");
		expect(btn.getAttribute("data-injected")).toBeNull();
		expect(btn.title).toContain(BREAKS_OUT_OF_AN_ATTRIBUTE);
	});
});

describe("a translated string in the disabled hint", () => {
	it("cannot add an attribute through its title", async () => {
		vi.stubGlobal("__", () => BREAKS_OUT_OF_AN_ATTRIBUTE);
		// settings off plus a role that can turn them on is the branch that builds the hint
		frappeGlobal.boot = { ...bootDefaults, frappe_ai: { enabled: false } };
		frappeGlobal.user_roles = ["System Manager"];
		const hint = await boot(TOP_NAVBAR, "frappe-ai-disabled-hint");
		expect(hint.getAttribute("data-injected")).toBeNull();
		expect(hint.title).toBe(BREAKS_OUT_OF_AN_ATTRIBUTE);
	});
});

describe("a translated string in a rendered image fallback", () => {
	it.each([
		["a src this site does not serve", "![](https://example.invalid/a.png)"],
		["a src that is not a web URL", "![](mailto:someone@example.invalid)"],
	])("is text, not markup, for %s", (_name, source) => {
		vi.stubGlobal("__", () => BREAKS_OUT_OF_AN_ELEMENT);
		const html = renderMarkdown(source);
		expect(html).not.toContain("<em");
		expect(html).toContain("&lt;em");
	});
});
