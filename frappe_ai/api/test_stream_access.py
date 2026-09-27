"""Who may start and stop a stream, and over which HTTP method."""

import unittest

import frappe
from frappe.tests.test_api import FrappeAPITestCase

from frappe_ai.api import chat


class TestStreamEndpointsRefuseGet(FrappeAPITestCase):
	# GET skips Frappe's CSRF check, so a cross-site link could start or stop a turn with the victim's cookie
	def test_start_stream_refuses_get(self):
		response = self.get(self.method("frappe_ai.api.chat.start_stream"), {"sid": self.sid, "message": " "})
		self.assertEqual(response.status_code, 403)

	def test_cancel_stream_refuses_get(self):
		response = self.get(
			self.method("frappe_ai.api.chat.cancel_stream"), {"sid": self.sid, "session_id": "s"}
		)
		self.assertEqual(response.status_code, 403)


class TestCancelReachesOnlyTheCallersStream(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_another_users_cancel_does_not_stop_the_stream(self):
		session_id = "stream-" + frappe.generate_hash(length=10)
		frappe.set_user("bob@example.com")
		chat.cancel_stream(session_id=session_id)

		frappe.set_user("alice@example.com")
		self.assertFalse(chat._is_stream_cancelled(session_id))
		chat.cancel_stream(session_id=session_id)
		self.assertTrue(chat._is_stream_cancelled(session_id))

		frappe.set_user("bob@example.com")
		self.assertTrue(chat._is_stream_cancelled(session_id))
