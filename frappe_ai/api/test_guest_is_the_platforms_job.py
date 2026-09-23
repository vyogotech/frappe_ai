"""Guest is refused by frappe.is_whitelisted before any endpoint body runs, so no endpoint repeats that check."""

import inspect
import unittest

import frappe
from frappe.tests.test_api import FrappeAPITestCase
from frappe.utils import get_test_client

from frappe_ai.api import chat, health

ENDPOINTS = {
	"frappe_ai.api.chat.get_recent_messages": chat.get_recent_messages,
	"frappe_ai.api.chat.start_stream": chat.start_stream,
	"frappe_ai.api.health.test_connection": health.test_connection,
}


class TestNoEndpointRepeatsThePlatformsGuestCheck(unittest.TestCase):
	def test_none_of_the_three_is_open_to_guest(self):
		# the invariant the deleted checks rested on: @frappe.whitelist() without allow_guest
		for name, fn in ENDPOINTS.items():
			with self.subTest(name):
				self.assertIn(fn, frappe.whitelisted)
				self.assertNotIn(fn, frappe.guest_methods)

	def test_no_endpoint_carries_a_guest_branch_of_its_own(self):
		for name, fn in ENDPOINTS.items():
			with self.subTest(name):
				source = inspect.getsource(inspect.unwrap(fn))
				self.assertNotIn('"Guest"', source, f"{name} repeats frappe.is_whitelisted's Guest check")

	def test_is_whitelisted_refuses_guest(self):
		frappe.set_user("Guest")
		self.addCleanup(frappe.set_user, "Administrator")
		for name, fn in ENDPOINTS.items():
			with self.subTest(name), self.assertRaises(frappe.PermissionError):
				frappe.is_whitelisted(fn)


class TestGuestGetsPermissionErrorOverHttp(FrappeAPITestCase):
	# cookie-less, so these requests are Guest whatever any other test in this process logged in as
	TEST_CLIENT = get_test_client(use_cookies=False)

	def test_every_endpoint_answers_guest_with_403(self):
		calls = [
			("get", "frappe_ai.api.chat.get_recent_messages"),
			("post", "frappe_ai.api.chat.start_stream"),
			("get", "frappe_ai.api.health.test_connection"),
		]
		for verb, name in calls:
			with self.subTest(name):
				response = getattr(self, verb)(self.method(name), {})
				self.assertEqual(response.status_code, 403)
				self.assertIn("PermissionError", response.get_data(as_text=True))
