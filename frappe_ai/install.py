import os

import frappe


def after_install():
	_ensure_settings()
	_sync_workspace()


def after_migrate():
	_ensure_settings()
	_sync_workspace()


def _ensure_settings():
	"""Create the AI Assistant Settings singleton if it doesn't exist yet."""
	if not frappe.db.exists("AI Assistant Settings", "AI Assistant Settings"):
		doc = frappe.new_doc("AI Assistant Settings")
		doc.insert(ignore_permissions=True)


def _sync_workspace():
	"""Force-import the Frappe AI workspace JSON so an existing install picks up
	updates to the workspace content blob on every migrate.

	Frappe's normal fixture sync (`bench migrate`) does not overwrite an
	already-installed Workspace's `content` field — it treats workspace layout as
	user-editable data after first install. That means improvements we ship to
	the workspace (intro paragraph, settings card, etc.) never reach users
	upgrading from a previous version. Calling `import_file_by_path` with
	`force=True` is the supported way to push the bundled JSON over the existing
	row; it's idempotent, so re-running on every migrate is safe.
	"""
	app_path = frappe.get_app_path("frappe_ai")
	workspace_path = os.path.join(app_path, "ai_assistant", "workspace", "Frappe AI", "Frappe AI.json")
	if not os.path.exists(workspace_path):
		return
	try:
		from frappe.modules.import_file import import_file_by_path

		import_file_by_path(workspace_path, force=True, ignore_version=True)
	except Exception:
		# Workspace re-import is best-effort. Don't break migrate if Frappe's
		# internal importer changes shape between versions.
		frappe.log_error(title="frappe_ai workspace sync failed")
