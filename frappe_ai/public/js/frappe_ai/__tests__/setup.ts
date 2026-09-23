/** Vitest setup: jsdom has no Frappe, so stub the globals our code touches (typed in ../types/frappe-globals.d.ts). */

import { vi } from "vitest";

const g = globalThis as Record<string, unknown>;

g.frappe = {
	call: vi.fn(),
	realtime: { on: vi.fn(), off: vi.fn() },
	utils: { icon: (n: string) => `<svg data-icon="${n}"></svg>` },
	boot: { sysdefaults: { currency: "INR" } },
	defaults: { get_default: vi.fn(() => null) },
	router: { current_route: [] },
	set_route: vi.fn(),
	ui: { keys: { add_shortcut: vi.fn() } },
};
g.cur_frm = undefined;
g.cur_list = undefined;

// frappe._ with no catalogue loaded: the source string, with the indexed {0}, {1} the app uses filled in
g.__ = (txt: string, replace?: (string | number)[]) =>
	replace ? txt.replace(/\{(\d+)\}/g, (m, i) => `${replace[+i] ?? m}`) : txt;
