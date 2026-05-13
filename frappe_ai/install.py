import frappe


def after_install():
	_ensure_settings()


def after_migrate():
	_ensure_settings()


def _ensure_settings():
	"""Create the AI Assistant Settings singleton if it doesn't exist yet."""
	if not frappe.db.exists("AI Assistant Settings", "AI Assistant Settings"):
		doc = frappe.new_doc("AI Assistant Settings")
		doc.insert(ignore_permissions=True)
