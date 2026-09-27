"""An agent whose host stopped resolving is a peer that is down, not a site nobody configured."""

import socket
import unittest
from unittest.mock import patch

import frappe

from frappe_ai.api import chat


class TestAgentUnreachable(unittest.TestCase):
	def setUp(self):
		self._ok = frappe.local.conf.get("frappe_ai_agent_url_unsafe_ok")
		frappe.local.conf["frappe_ai_agent_url_unsafe_ok"] = 1

	def tearDown(self):
		if self._ok is None:
			frappe.local.conf.pop("frappe_ai_agent_url_unsafe_ok", None)
		else:
			frappe.local.conf["frappe_ai_agent_url_unsafe_ok"] = self._ok

	def _refused(self, url="http://test-agent:8484"):
		with patch.object(chat.socket, "getaddrinfo", side_effect=socket.gaierror(-2, "Name not known")):
			with self.assertRaises(frappe.ValidationError) as caught:
				chat._check_agent_url(url)
		return str(caught.exception)

	def test_a_host_that_does_not_resolve_reads_as_unreachable(self):
		self.assertEqual(self._refused(), chat._UNREACHABLE)

	def test_a_system_manager_reads_the_same_line(self):
		with patch.object(frappe, "get_roles", return_value=["System Manager"]):
			self.assertEqual(self._refused(), chat._UNREACHABLE)

	def test_a_url_that_is_really_wrong_still_reads_as_a_setting(self):
		with self.assertRaises(frappe.ValidationError) as caught:
			chat._check_agent_url("ftp://test-agent:8484")
		self.assertNotEqual(str(caught.exception), chat._UNREACHABLE)
