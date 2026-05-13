/**
 * Vitest setup — runs before every test. Frappe's runtime globals don't
 * exist in jsdom, so we stub the minimum surface our code touches.
 *
 * The globals' types are declared in `../types/frappe-globals.d.ts`;
 * here we just assign default runtime values via the globalThis bag.
 * Individual tests can override these with `vi.spyOn(...)` or by
 * reassigning specific properties.
 */

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
