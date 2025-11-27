"""
Desktop configuration for Frappe AI
"""
from frappe import _


def get_data():
	return [
		{
			"module_name": "Frappe AI",
			"category": "Modules",
			"label": _("AI Assistant"),
			"color": "#667eea",
			"icon": "octicon octicon-hubot",
			"type": "module",
			"description": _("AI-powered assistant for your ERPNext data")
		}
	]

