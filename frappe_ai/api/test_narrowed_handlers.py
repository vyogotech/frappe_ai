"""The narrowed handlers still absorb the failures they contract to, and no longer dress a bug up as one of them."""

import datetime as dt
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe

from frappe_ai.api import chat, health


class TestConnectionTestScope(unittest.TestCase):
	def _settings(self):
		return patch.object(frappe, "get_single", return_value=SimpleNamespace(enabled=1))

	def test_a_bug_is_not_reported_to_the_operator_as_a_connection_failure(self):
		with (
			self._settings(),
			patch.object(health, "_agent_url", return_value="http://agent:8484"),
			patch.object(health, "_validate_agent_url"),
			patch.object(health.requests, "get", side_effect=AttributeError("bug")),
			self.assertRaises(AttributeError),
		):
			health.test_connection()

	def test_a_host_with_an_over_long_dns_label_is_reported_as_a_failure(self):
		# socket.getaddrinfo raises UnicodeError, not gaierror, so _validate_agent_url does not convert it
		with (
			self._settings(),
			patch.object(health, "_agent_url", return_value="http://" + "a" * 64 + ".example.com"),
		):
			out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("Connection test failed", out["message"])

	def test_a_health_body_that_is_not_json_is_reported_as_a_failure(self):
		response = MagicMock(status_code=200, text="<html>502</html>")
		response.json.side_effect = ValueError("Expecting value")
		with (
			self._settings(),
			patch.object(health, "_agent_url", return_value="http://agent:8484"),
			patch.object(health, "_validate_agent_url"),
			patch.object(health.requests, "get", return_value=response),
		):
			out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("Connection test failed", out["message"])


class TestIsoUtcScope(unittest.TestCase):
	naive = dt.datetime(2026, 1, 2, 3, 4, 5)

	def test_a_time_zone_this_host_has_no_entry_for_falls_back_to_utc(self):
		with patch("frappe.utils.get_system_timezone", return_value="Not/AZone"):
			self.assertEqual(chat._to_iso_utc(self.naive), "2026-01-02T03:04:05Z")

	def test_a_bug_in_the_time_zone_lookup_is_not_hidden_behind_the_utc_fallback(self):
		with (
			patch("frappe.utils.get_system_timezone", side_effect=TypeError("bug")),
			self.assertRaises(TypeError),
		):
			chat._to_iso_utc(self.naive)
