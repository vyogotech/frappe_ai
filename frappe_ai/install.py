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

	Frappe's normal sync (`bench migrate`) installs a workspace from JSON only
	the first time — subsequent migrates treat the workspace's `content` field
	as user-editable data and skip the re-import. That means improvements we
	ship to the workspace (intro paragraph, settings card, etc.) never reach
	users upgrading from a previous version unless they manually re-import.

	`frappe.modules.import_file.import_file_by_path` is the same public helper
	Frappe uses internally (model/sync.py, commands/site.py, utils/dashboard.py)
	to load doctype/workspace/dashboard JSON into the DB. Passing `force=True`
	pushes the bundled JSON over the existing row; it's idempotent, so re-running
	on every migrate is safe.
	"""
	app_path = frappe.get_app_path("frappe_ai")
	workspace_path = os.path.join(app_path, "ai_assistant", "workspace", "Frappe AI", "Frappe AI.json")
	if not os.path.exists(workspace_path):
		return
	try:
		from frappe.modules.import_file import import_file_by_path

		import_file_by_path(workspace_path, force=True, ignore_version=True)
	except Exception:
		# Best-effort: don't break migrate if Frappe changes the importer
		# signature between versions. The workspace will simply remain at its
		# pre-upgrade state until the user re-runs migrate against a
		# compatible Frappe version.
		frappe.log_error(title="frappe_ai workspace sync failed")
