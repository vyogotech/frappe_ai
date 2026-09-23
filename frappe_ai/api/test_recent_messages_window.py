# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""get_recent_messages returns the newest page of a chat longer than `limit`, not its first page."""

import frappe
from frappe.tests import IntegrationTestCase

from frappe_ai.api import chat


class TestRecentMessagesWindow(IntegrationTestCase):
	def _chat_of(self, count: int) -> str:
		"""A session with `count` messages, stamped a minute apart so their order does not ride on clock resolution."""
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-window",
				"user": frappe.session.user,
			}
		).insert(ignore_permissions=True)
		# on_trash takes the chat's messages with it, so this clears what this test inserted and nothing else
		self.addCleanup(
			frappe.delete_doc, "AI Chat Session", session.name, ignore_permissions=True, force=True
		)
		for i in range(count):
			msg = frappe.get_doc(
				{
					"doctype": "AI Chat Message",
					"session": session.name,
					"role": "user" if i % 2 == 0 else "assistant",
					"content": f"msg-{i}",
				}
			).insert(ignore_permissions=True)
			frappe.db.set_value(
				"AI Chat Message",
				msg.name,
				"creation",
				frappe.utils.add_to_date(None, minutes=i - count),
				update_modified=False,
			)
		return session.name

	def test_returns_the_newest_limit_messages_oldest_first(self):
		self._chat_of(10)

		out = chat.get_recent_messages(limit=4)

		self.assertEqual(
			[m["content"] for m in out["messages"]],
			["msg-6", "msg-7", "msg-8", "msg-9"],
		)

	def test_newest_turn_survives_a_chat_longer_than_the_sidebars_page(self):
		# the sidebar asks for 50 (useChat.ts): the last thing said must be in what it gets back
		self._chat_of(60)

		out = chat.get_recent_messages(limit=50)

		self.assertEqual(len(out["messages"]), 50)
		self.assertEqual(out["messages"][-1]["content"], "msg-59")
		self.assertEqual(out["messages"][0]["content"], "msg-10")

	def test_shorter_chat_is_returned_whole(self):
		self._chat_of(3)

		out = chat.get_recent_messages(limit=50)

		self.assertEqual([m["content"] for m in out["messages"]], ["msg-0", "msg-1", "msg-2"])
