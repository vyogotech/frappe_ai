"""A chat belongs to the user who starts it: nobody starts one in another user's name or writes into it."""

import frappe
from frappe.tests import IntegrationTestCase

ALICE, BOB = "chat_owner_alice@example.com", "chat_owner_bob@example.com"


class TestChatOwnership(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email in (ALICE, BOB):
			if not frappe.db.exists("User", email):
				user = {"doctype": "User", "email": email, "first_name": email.split("@")[0]}
				frappe.get_doc(user | {"send_welcome_email": 0, "roles": [{"role": "All"}]}).insert(
					ignore_permissions=True
				)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _chat(self, user):
		frappe.set_user(user)
		return frappe.get_doc(
			{"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12)}
		).insert()

	def _message(self, session, content="x"):
		message = {"doctype": "AI Chat Message", "session": session, "role": "assistant", "content": content}
		return frappe.get_doc(message)

	def test_a_session_belongs_to_the_user_who_creates_it(self):
		frappe.set_user(BOB)
		chat = {"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12), "user": ALICE}
		self.assertEqual(frappe.get_doc(chat).insert().user, BOB)

	def test_nobody_writes_into_another_users_chat(self):
		alices = self._chat(ALICE)
		frappe.set_user(BOB)
		with self.assertRaises(frappe.PermissionError):
			self._message(alices.name, "planted").insert()

	def test_nobody_moves_a_message_into_another_users_chat(self):
		alices = self._chat(ALICE)
		message = self._message(self._chat(BOB).name).insert()
		message.session = alices.name
		with self.assertRaises(frappe.PermissionError):
			message.save()

	def test_the_owner_writes_into_their_own_chat(self):
		chat = self._chat(ALICE)
		self.assertEqual(self._message(chat.name).insert().session, chat.name)
