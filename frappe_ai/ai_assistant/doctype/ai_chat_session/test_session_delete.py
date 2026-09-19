"""A chat goes with its messages, from the desk or the API, and only for whoever may delete the chat."""

import frappe
from frappe.tests import IntegrationTestCase

OWNER, OTHER = "chat_delete_owner@example.com", "chat_delete_other@example.com"


class TestSessionDelete(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email in (OWNER, OTHER):
			if not frappe.db.exists("User", email):
				user = {"doctype": "User", "email": email, "first_name": email.split("@")[0]}
				frappe.get_doc(user | {"send_welcome_email": 0, "roles": [{"role": "All"}]}).insert(
					ignore_permissions=True
				)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _chat_with_messages(self):
		frappe.set_user(OWNER)
		session = frappe.get_doc(
			{"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12)}
		).insert()
		for role in ("user", "assistant"):
			message = {"doctype": "AI Chat Message", "session": session.name, "role": role, "content": "x"}
			frappe.get_doc(message).insert()
		return session.name

	def test_a_chat_goes_with_its_messages(self):
		session = self._chat_with_messages()
		frappe.delete_doc("AI Chat Session", session)
		self.assertFalse(frappe.db.exists("AI Chat Session", session))
		self.assertFalse(frappe.db.count("AI Chat Message", {"session": session}))

	def test_nobody_deletes_another_users_chat_or_its_messages(self):
		session = self._chat_with_messages()
		frappe.set_user(OTHER)
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("AI Chat Session", session)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.count("AI Chat Message", {"session": session}), 2)
