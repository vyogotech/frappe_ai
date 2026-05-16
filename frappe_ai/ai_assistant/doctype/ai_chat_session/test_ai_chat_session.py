# Copyright (c) 2026, Vyogo and contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase


class TestAIChatSession(IntegrationTestCase):
	"""Regression tests for AI Chat Session — tenant-isolation column gap (BUG-018).

	The saas_platform `permission_query_conditions` hook injects
	`tabAI Chat Session.tenant_id = <value>` into every list query made by a
	non-admin user. If the DocType has no `tenant_id` column, the query raises
	MySQL 1054 "Unknown column" and the user sees a Server Error modal.
	"""

	def setUp(self):
		# Ensure a known non-admin user exists.
		email = "tenant_test_user@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": "Tenant",
					"last_name": "Test",
					"send_welcome_email": 0,
					"roles": [{"role": "All"}],
				}
			).insert(ignore_permissions=True)
		self.user = email
		self.addCleanup(frappe.set_user, "Administrator")

	def test_non_admin_can_list_chat_sessions_without_sql_error(self):
		frappe.set_user(self.user)
		# Should not raise — was MySQLdb.OperationalError before BUG-018 fix.
		frappe.get_list("AI Chat Session", limit=1)

	def test_doctype_has_tenant_id_column(self):
		# The saas_platform tenant filter requires this column to exist on the table.
		self.assertTrue(
			frappe.db.has_column("AI Chat Session", "tenant_id"),
			"AI Chat Session must have a tenant_id column for tenant-isolation queries to work",
		)

	def test_user_field_locked_after_insert(self):
		# BUG-010: pre-fix, System Manager could reassign a session's user via
		# the Desk form. Reassignment must raise even with ignore_permissions.
		other_email = "other_tenant_user@example.com"
		if not frappe.db.exists("User", other_email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": other_email,
					"first_name": "Other",
					"send_welcome_email": 0,
					"roles": [{"role": "All"}],
				}
			).insert(ignore_permissions=True)

		original_user = frappe.session.user
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-user-lock",
				"user": original_user,
			}
		).insert(ignore_permissions=True)
		self.addCleanup(
			frappe.delete_doc, "AI Chat Session", session.name, ignore_permissions=True, force=True
		)

		session.user = other_email
		with self.assertRaises(frappe.ValidationError):
			session.save(ignore_permissions=True)
		session.reload()
		self.assertEqual(session.user, original_user)

	def test_context_json_locked_after_insert(self):
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-ctx-lock",
				"user": frappe.session.user,
				"context_json": '{"original": true}',
			}
		).insert(ignore_permissions=True)
		self.addCleanup(
			frappe.delete_doc, "AI Chat Session", session.name, ignore_permissions=True, force=True
		)
		session.context_json = '{"tampered": true}'
		with self.assertRaises(frappe.ValidationError):
			session.save(ignore_permissions=True)

	def test_title_and_last_activity_can_still_be_updated(self):
		# The lock should only protect user + context_json — the agent itself
		# writes title (auto-derived from first message) and last_activity
		# after insert, so those must remain writeable.
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-meta-mutable",
				"user": frappe.session.user,
			}
		).insert(ignore_permissions=True)
		self.addCleanup(
			frappe.delete_doc, "AI Chat Session", session.name, ignore_permissions=True, force=True
		)
		session.title = "Updated title"
		session.last_activity = frappe.utils.now_datetime()
		session.save(ignore_permissions=True)  # must not raise
