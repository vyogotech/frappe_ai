"""Public API for the Frappe AI frontend."""

import frappe


@frappe.whitelist()
def get_settings() -> dict:
	"""Return AI Assistant Settings for the frontend sidebar."""
	settings = frappe.get_single("AI Assistant Settings")
	return {
		"enabled": bool(settings.enabled),
		"sidebar_width": getattr(settings, "sidebar_width", None) or 380,
		"keyboard_shortcut": getattr(settings, "keyboard_shortcut", None) or "Ctrl+/",
	}
