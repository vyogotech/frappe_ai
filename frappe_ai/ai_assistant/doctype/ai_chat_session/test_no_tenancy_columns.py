# Copyright (c) 2026, Vyogo and contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

# The site is the tenancy boundary, so neither chat DocType carries a tenant column, and the session
# no longer carries a start time that only repeats Frappe's own `creation`.
DROPPED = {
	"AI Chat Session": ("tenant_id", "started_at"),
	"AI Chat Message": ("tenant_id",),
}
# Read by the other frontend, so removing either one breaks a chat it can still load: it selects and
# orders on AI Chat Message.created_at, and on AI Chat Session.last_activity for the chat list.
KEPT = {"AI Chat Session": ("last_activity",), "AI Chat Message": ("created_at",)}


class TestNoTenancyColumns(IntegrationTestCase):
	"""Neither chat DocType has a tenant field, and the two timestamps another frontend reads are still there."""

	def test_dropped_fields_are_gone_from_both_doctypes(self):
		for doctype, fieldnames in DROPPED.items():
			meta = frappe.get_meta(doctype, cached=False)
			for fieldname in fieldnames:
				with self.subTest(doctype=doctype, fieldname=fieldname):
					self.assertIsNone(
						meta.get_field(fieldname),
						f"{doctype}.{fieldname} is back; this app has no tenant column, and one"
						" timestamp per row is enough",
					)

	def test_the_timestamps_another_frontend_selects_are_still_fields(self):
		for doctype, fieldnames in KEPT.items():
			meta = frappe.get_meta(doctype, cached=False)
			for fieldname in fieldnames:
				with self.subTest(doctype=doctype, fieldname=fieldname):
					self.assertIsNotNone(
						meta.get_field(fieldname),
						f"{doctype}.{fieldname} is selected by name from outside this app; dropping"
						" the field makes that query fail, whatever the table still holds",
					)

	def test_a_new_session_and_message_arrive_with_their_timestamp(self):
		session = frappe.get_doc(
			{"doctype": "AI Chat Session", "name": "test-session-no-tenancy", "user": frappe.session.user}
		).insert(ignore_permissions=True)
		self.addCleanup(
			frappe.delete_doc, "AI Chat Session", session.name, ignore_permissions=True, force=True
		)
		message = frappe.get_doc(
			{"doctype": "AI Chat Message", "session": session.name, "role": "user", "content": "hello"}
		).insert(ignore_permissions=True)
		self.assertIsNotNone(session.last_activity)
		self.assertIsNotNone(message.created_at)
