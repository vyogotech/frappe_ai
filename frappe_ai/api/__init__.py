"""Public API for the Frappe AI frontend."""

import frappe


@frappe.whitelist()
def get_settings() -> dict:
    """Return MCP Server Settings for the frontend sidebar."""
    settings = frappe.get_single("MCP Server Settings")
    return {
        "enabled": bool(settings.enabled),
        "mcp_server_url": settings.mcp_server_url,
        "sidebar_width": getattr(settings, "sidebar_width", None) or 380,
        "keyboard_shortcut": getattr(settings, "keyboard_shortcut", None) or "Ctrl+/",
    }