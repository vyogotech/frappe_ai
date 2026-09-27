import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBootSettings } from "./boot-settings";
import { decideBoot } from "./boot-decision";

const g = globalThis as Record<string, unknown>;

/** Stand up a desk whose boot carries this payload, or none at all. */
function deskBootedWith(frappe_ai: unknown) {
	g.frappe = { boot: { sysdefaults: { currency: "INR" }, frappe_ai } };
}

describe("the settings the desk boot delivers", () => {
	let originalFrappe: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
	});

	it("is read off frappe.boot, with no call of its own", () => {
		deskBootedWith({
			enabled: true,
			sidebar_width: 420,
			keyboard_shortcut: "Mod+Shift+A",
			timeout: 300,
		});
		expect(readBootSettings()).toEqual({
			enabled: true,
			sidebarWidth: 420,
			keyboardShortcut: "Mod+Shift+A",
			timeout: 300,
			loadError: false,
		});
	});

	it("falls back per key to the doctype's own defaults", () => {
		deskBootedWith({ enabled: true });
		const settings = readBootSettings();
		expect(settings.sidebarWidth).toBe(380);
		expect(settings.keyboardShortcut).toBe("Alt+/"); // not the reserved Ctrl+/
		expect(settings.timeout).toBe(120);
		expect(settings.loadError).toBe(false);
	});

	it("reads a boot without the app's settings as a failure, not as AI switched off", () => {
		deskBootedWith(undefined);
		const settings = readBootSettings();
		expect(settings.loadError).toBe(true);
		expect(settings.enabled).toBe(false);
		expect(
			decideBoot({
				enabled: settings.enabled,
				roles: ["All"],
				loadError: settings.loadError,
			}),
		).toBe("mount-sidebar");
		expect(
			decideBoot({
				enabled: settings.enabled,
				roles: ["System Manager"],
				loadError: settings.loadError,
			}),
		).toBe("mount-sidebar");
		expect(decideBoot({ enabled: false, roles: ["System Manager"] })).toBe(
			"show-disabled-hint",
		);
	});

	it("survives a page with no frappe at all", () => {
		g.frappe = undefined;
		expect(readBootSettings().loadError).toBe(true);
		expect(readBootSettings().keyboardShortcut).toBe("Alt+/");
	});
});
