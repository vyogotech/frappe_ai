"""A stored message is the record of what was asked and what the agent's tools returned: its owner may delete it with
the chat, but not rewrite it."""

import frappe
from frappe.tests import IntegrationTestCase

OWNER = "message_record_owner@example.com"


class TestAMessageIsNotRewritable(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("User", OWNER):
			user = {"doctype": "User", "email": OWNER, "first_name": "Owner", "send_welcome_email": 0}
			frappe.get_doc(user | {"roles": [{"role": "All"}]}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_the_owner_cannot_rewrite_a_tool_result(self):
		frappe.set_user(OWNER)
		chat = frappe.get_doc(
			{"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12)}
		).insert()
		message = {
			"doctype": "AI Chat Message",
			"session": chat.name,
			"role": "tool",
			"tool_result_json": '{"ok": true}',
		}
		message = frappe.get_doc(message).insert()
		message.tool_result_json = '{"ok": false}'
		with self.assertRaises(frappe.PermissionError):
			message.save()
		message.reload()
		message.delete()
