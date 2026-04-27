# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	"""Rename MCP Server Settings.mcp_server_url to agent_url.

	Idempotent: no-op if the old column does not exist.
	"""
	if not frappe.db.has_column("MCP Server Settings", "mcp_server_url"):
		return
	rename_field("MCP Server Settings", "mcp_server_url", "agent_url")
