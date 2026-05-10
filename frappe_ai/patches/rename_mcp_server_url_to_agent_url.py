import frappe


def execute():
	"""Rename mcp_server_url → agent_url in tabSingles.

	AI Assistant Settings is a Single DocType — values live in tabSingles,
	not in a dedicated table column. rename_field() is a no-op for Singles;
	the row must be updated directly.
	"""
	frappe.db.sql(
		"UPDATE `tabSingles` SET field = 'agent_url'"
		" WHERE doctype = 'AI Assistant Settings' AND field = 'mcp_server_url'"
	)
