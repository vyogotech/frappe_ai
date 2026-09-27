import { beforeEach, describe, expect, it, vi } from "vitest";

// the bundle does its work in frappe's app_ready handler, which it registers through jQuery
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

/** Boot the bundle into a desk that has no top navbar, so the sidebar-link variant is built. */
async function bootSidebarVariant(): Promise<HTMLElement> {
	document.body.innerHTML = '<div class="dropdown-navbar-user"></div>';
	vi.resetModules();
	await import("./frappe_ai.bundle");
	appReady?.();
	const btn = document.getElementById("frappe-ai-nav-btn");
	if (!btn) throw new Error("the bundle injected no nav button");
	return btn;
}

describe("the navbar toggle", () => {
	beforeEach(() => {
		appReady = undefined;
	});

	it("is reachable and operable from the keyboard where it is an anchor", async () => {
		const btn = await bootSidebarVariant();
		expect(btn.tagName).toBe("A");
		expect(btn.getAttribute("role")).toBe("button");
		expect(btn.tabIndex).toBe(0);

		const toggles: string[] = [];
		document.addEventListener("frappe-ai-toggle", () => toggles.push("toggle"));
		btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		btn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		expect(toggles).toHaveLength(2);
	});

	it("says whether the panel it controls is open", async () => {
		const btn = await bootSidebarVariant();
		expect(btn.getAttribute("aria-controls")).toBe("frappe-ai-sidebar-root");
		expect(document.getElementById("frappe-ai-sidebar-root")).not.toBeNull();
		expect(btn.getAttribute("aria-expanded")).toBe("false");

		document.dispatchEvent(new CustomEvent("frappe-ai-opened"));
		expect(btn.getAttribute("aria-expanded")).toBe("true");

		document.dispatchEvent(new CustomEvent("frappe-ai-closed"));
		expect(btn.getAttribute("aria-expanded")).toBe("false");
	});
});
