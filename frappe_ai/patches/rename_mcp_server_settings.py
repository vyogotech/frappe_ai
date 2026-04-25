import frappe


def execute():
	old_name = "MCP Server Settings"
	new_name = "AI Assistant Settings"

	if not frappe.db.exists("DocType", old_name):
		return

	if frappe.db.exists("DocType", new_name):
		# DocType sync ran before this patch — copy Singles row data over,
		# then drop the old DocType (rename_doc would collide otherwise).
		old_values = dict(
			frappe.db.sql(
				"SELECT field, value FROM `tabSingles` WHERE doctype = %s",
				old_name,
			)
		)
		new_meta = frappe.get_meta(new_name)
		for field, value in old_values.items():
			if new_meta.get_field(field):
				frappe.db.set_value(new_name, new_name, field, value, update_modified=False)
		frappe.delete_doc("DocType", old_name, force=True, ignore_missing=True)
	else:
		# Pre-sync: rename in place. rename_doc handles the table rename,
		# the tabSingles `doctype` column, and meta references.
		frappe.rename_doc("DocType", old_name, new_name, force=True)

	frappe.db.commit()
