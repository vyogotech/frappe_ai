"""The agent URL guard: the escape hatch allows private addresses only, and the sid never goes out in the clear."""

import socket
import unittest
from unittest.mock import patch

import frappe

from frappe_ai.api import chat


class TestAgentUrlGuard(unittest.TestCase):
	def setUp(self):
		self._original = frappe.local.conf.get("frappe_ai_agent_url_unsafe_ok")

	def tearDown(self):
		if self._original is None:
			frappe.local.conf.pop("frappe_ai_agent_url_unsafe_ok", None)
		else:
			frappe.local.conf["frappe_ai_agent_url_unsafe_ok"] = self._original

	def assert_refused(self, url, unsafe_ok):
		frappe.local.conf["frappe_ai_agent_url_unsafe_ok"] = unsafe_ok
		with self.assertRaises(frappe.ValidationError, msg=f"{url} with unsafe_ok={unsafe_ok}"):
			chat._validate_agent_url(url)

	def test_escape_hatch_still_refuses_metadata_and_link_local(self):
		for url in (
			"http://169.254.169.254/",
			"http://metadata.google.internal/",
			"http://169.254.170.2/v2/credentials",
			"http://[fe80::1]:8484",
		):
			self.assert_refused(url, 1)

	def test_escape_hatch_refuses_a_name_that_resolves_to_link_local(self):
		info = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 8484))]
		with patch.object(chat.socket, "getaddrinfo", return_value=info):
			self.assert_refused("http://agent:8484", 1)

	def test_public_address_needs_https(self):
		self.assert_refused("http://1.1.1.1:8484", 0)
		self.assert_refused("http://1.1.1.1:8484", 1)
		frappe.local.conf["frappe_ai_agent_url_unsafe_ok"] = 0
		chat._validate_agent_url("https://1.1.1.1:8484")

	def test_unresolvable_host_is_refused(self):
		self.assert_refused("http://agent.invalid:8484", 0)
		self.assert_refused("http://agent.invalid:8484", 1)

	def test_escape_hatch_allows_private_and_loopback(self):
		frappe.local.conf["frappe_ai_agent_url_unsafe_ok"] = 1
		chat._validate_agent_url("http://10.0.0.5:8484")
		chat._validate_agent_url("http://127.0.0.1:8484")
		chat._validate_agent_url("http://localhost:8484")
