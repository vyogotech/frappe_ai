"""
AI Search Provider for Frappe Awesome Bar
Handles @ai queries by overriding global search
"""

import frappe
import frappe.utils.global_search
from frappe import _ as __


@frappe.whitelist()
def search(text, start=0, limit=20, doctype=""):
	"""
	Override Frappe's global search to handle @ai queries
	Falls back to standard search for non-@ai queries
	"""
	# Check if query starts with @ai
	if text and text.lower().startswith("@ai"):
		return handle_ai_search(text, start, limit)

	# Call the original desk awesome-bar search for non-@ai queries.
	# `override_whitelisted_methods` only intercepts API dispatch, so a direct
	# Python call here bypasses our override and hits the real implementation.
	return frappe.utils.global_search.search(text, start=start, limit=limit, doctype=doctype)


def handle_ai_search(text, start=0, limit=20):
	"""
	Handle @ai search queries
	Returns list of results in Frappe's expected format
	"""
	# Extract the query after @ai
	query = text[3:].strip()

	results = []

	if not query:
		# Show hint when just @ai is typed
		results.append(
			{
				"doctype": "AI Assistant",
				"name": "@ai",
				"title": __("AI Assistant"),
				"content": __("Type your question after @ai (e.g., @ai show me top 5 customers)"),
				"route": "#",
			}
		)
	else:
		# Return AI query option
		from urllib.parse import quote

		results.append(
			{
				"doctype": "AI Assistant",
				"name": f"@ai {query}",
				"title": __("Ask AI: {0}").format(query),
				"content": __("Query AI assistant about your data"),
				"route": f"/ai-chat#query:{quote(query)}",
			}
		)

	return results
