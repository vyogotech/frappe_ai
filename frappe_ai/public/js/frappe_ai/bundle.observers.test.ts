/** The bootstrap's body-wide MutationObservers stop once their element is placed, so streaming costs no layout. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let observing = 0;
let avatarProbes = 0;

class CountingMutationObserver extends globalThis.MutationObserver {
	private watching = false;

	observe(target: Node, options?: MutationObserverInit): void {
		if (!this.watching) {
			this.watching = true;
			observing += 1;
		}
		super.observe(target, options);
	}

	disconnect(): void {
		if (this.watching) {
			this.watching = false;
			observing -= 1;
		}
		super.disconnect();
	}
}

/** The desk boot, with the two globals the bundle reads at module scope and on app_ready. */
function boot(opts: { enabled: boolean; roles?: string[] }): () => void {
	let ready = () => {};
	vi.stubGlobal("$", () => ({ on: (_e: string, h: () => void) => (ready = h) }));
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe(): void {}
			disconnect(): void {}
		},
	);
	const g = globalThis as Record<string, unknown>;
	const frappe = g.frappe as Record<string, unknown>;
	frappe.boot = { frappe_ai: { enabled: opts.enabled, sidebar_width: 380, timeout: 120 } };
	frappe.user_roles = opts.roles ?? [];
	frappe.router = { current_route: [], on: vi.fn() };
	return () => ready();
}

/** One macrotask, so the observer's callbacks have run. */
const settled = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	observing = 0;
	avatarProbes = 0;
	document.body.innerHTML = "";
	vi.resetModules();
	vi.stubGlobal("MutationObserver", CountingMutationObserver);
	const real = Document.prototype.querySelectorAll;
	vi.spyOn(Document.prototype, "querySelectorAll").mockImplementation(function (
		this: Document,
		selector: string,
	) {
		if (selector === ".desktop-avatar") avatarProbes += 1;
		return real.call(this, selector);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("the navbar button's observer", () => {
	it("is released as soon as the button is in place", async () => {
		document.body.innerHTML = `<nav><div class="dropdown-navbar-user"></div></nav>`;
		const ready = boot({ enabled: true });
		await import("../frappe_ai.bundle");
		ready();
		await settled();

		expect(document.getElementById("frappe-ai-nav-btn")).not.toBeNull();
		expect(observing).toBe(0);
	});

	it("costs nothing once placed, however much the desk mutates underneath it", async () => {
		document.body.innerHTML = `<nav><div class="dropdown-navbar-user"></div></nav>`;
		const ready = boot({ enabled: true });
		await import("../frappe_ai.bundle");
		ready();
		await settled();

		avatarProbes = 0;
		// what a streamed answer does to the body: one chunk per task, so one observer callback each, not one batch
		for (let i = 0; i < 20; i += 1) {
			document.body.appendChild(document.createElement("span"));
			await settled();
		}

		expect(avatarProbes).toBe(0);
	});

	it("keeps watching while the navbar is absent, and lets go once it arrives", async () => {
		const ready = boot({ enabled: true });
		await import("../frappe_ai.bundle");
		ready();
		await settled();

		expect(document.getElementById("frappe-ai-nav-btn")).toBeNull();
		expect(observing).toBe(1);

		const nav = document.createElement("nav");
		nav.innerHTML = `<div class="dropdown-navbar-user"></div>`;
		document.body.appendChild(nav);
		await settled();

		expect(document.getElementById("frappe-ai-nav-btn")).not.toBeNull();
		expect(observing).toBe(0);
	});
});

describe("the disabled hint's observer", () => {
	it("is released as soon as the hint is in place", async () => {
		document.body.innerHTML = `<nav><span class="desktop-avatar"></span></nav>`;
		// jsdom lays nothing out, so offsetParent is null for every element; the bundle reads it to skip the
		// 0x0 navbar v16 leaves behind after a route change
		const avatar = document.querySelector(".desktop-avatar") as HTMLElement;
		Object.defineProperty(avatar, "offsetParent", { value: avatar.parentElement });
		const ready = boot({ enabled: false, roles: ["System Manager"] });
		await import("../frappe_ai.bundle");
		ready();
		await settled();

		expect(document.getElementById("frappe-ai-disabled-hint")).not.toBeNull();
		expect(observing).toBe(0);
	});
});
