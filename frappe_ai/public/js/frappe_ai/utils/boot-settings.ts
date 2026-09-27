/** The sidebar's settings as the desk boot delivers them (the extend_bootinfo hook in hooks.py). */

export interface BootSettings {
	enabled: boolean;
	sidebarWidth: number;
	keyboardShortcut: string;
	/** Seconds the relay gives the agent; the sidebar sizes its own limit from it, so it is not a sidebar setting. */
	timeout: number;
	/** The boot carried no settings for this app, so `enabled` is unknown rather than off. */
	loadError: boolean;
}

// the doctype's own defaults, for a boot that did not carry the settings
const DEFAULTS = {
	sidebarWidth: 380,
	// Matches the doctype default; `Ctrl+/` is reserved by Frappe v16.
	keyboardShortcut: "Alt+/",
	timeout: 120,
};

export function readBootSettings(): BootSettings {
	const boot = typeof frappe === "undefined" ? undefined : frappe.boot?.frappe_ai;
	if (!boot) return { enabled: false, ...DEFAULTS, loadError: true };
	return {
		enabled: boot.enabled ?? false,
		sidebarWidth: boot.sidebar_width ?? DEFAULTS.sidebarWidth,
		keyboardShortcut: boot.keyboard_shortcut ?? DEFAULTS.keyboardShortcut,
		timeout: boot.timeout ?? DEFAULTS.timeout,
		loadError: false,
	};
}
