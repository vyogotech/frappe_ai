"""Frappe's erasure request reaches a user's chats: their questions, answers and tool records are redacted."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

USER = "chat_erasure_probe@example.com"
SECRET = "the words only this user typed"


class TestPersonalDataErasure(IntegrationTestCase):
	def test_an_erasure_request_redacts_the_users_chats(self):
		if not frappe.db.exists("User", USER):
			user = {"doctype": "User", "email": USER, "first_name": "Erasure", "send_welcome_email": 0}
			frappe.get_doc(user | {"roles": [{"role": "All"}]}).insert(ignore_permissions=True)
		frappe.set_user(USER)
		session = frappe.get_doc({"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12)})
		session.update({"title": SECRET, "context_json": SECRET}).insert()
		message = {"doctype": "AI Chat Message", "session": session.name, "role": "tool", "content": SECRET}
		message = frappe.get_doc(message | {"tool_args_json": SECRET, "tool_result_json": SECRET}).insert()
		frappe.set_user("Administrator")

		with patch("frappe.sendmail"):  # the request mails the user; this site has no outgoing account
			request = frappe.get_doc({"doctype": "Personal Data Deletion Request", "email": USER})
			request.insert(ignore_permissions=True)
			request.db_set("status", "Pending Approval")  # the user confirmed by mail
			request.trigger_data_deletion()

		kept = frappe.db.get_value("AI Chat Session", session.name, ["title", "context_json"])
		kept += frappe.db.get_value(
			"AI Chat Message", message.name, ["content", "tool_args_json", "tool_result_json"]
		)
		self.assertNotIn(SECRET, kept)
