# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""Tests for frappe_ai.api.health.test_connection — the Settings page's
'Test Connection' button. Mocks the outbound requests.get call so CI
doesn't depend on a reachable agent."""

import unittest
from unittest.mock import MagicMock, patch

import frappe
import requests

from frappe_ai.api import health


class TestHealthEndpoint(unittest.TestCase):
	def setUp(self):
		self._original_url = frappe.local.conf.get("frappe_ai_agent_url")
		frappe.local.conf["frappe_ai_agent_url"] = "http://localhost:8484"

		self.settings = frappe.get_single("AI Assistant Settings")
		self._original_enabled = self.settings.enabled
		self.settings.enabled = 1
		self.settings.save(ignore_version=True)

	def tearDown(self):
		settings = frappe.get_single("AI Assistant Settings")
		settings.enabled = self._original_enabled
		settings.save(ignore_version=True)
		if self._original_url is None:
			frappe.local.conf.pop("frappe_ai_agent_url", None)
		else:
			frappe.local.conf["frappe_ai_agent_url"] = self._original_url

	def test_returns_disabled_when_assistant_off(self):
		self.settings.enabled = 0
		self.settings.save(ignore_version=True)
		out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("not enabled", out["message"])

	def test_returns_no_url_when_unset(self):
		frappe.local.conf.pop("frappe_ai_agent_url", None)
		out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("not configured", out["message"])

	@patch("requests.get")
	def test_success_path_returns_health_payload(self, mock_get):
		mock_response = MagicMock()
		mock_response.status_code = 200
		mock_response.text = '{"status":"ok","build":"abc123"}'
		mock_response.json.return_value = {"status": "ok", "build": "abc123"}
		mock_get.return_value = mock_response

		out = health.test_connection()
		self.assertTrue(out["success"])
		self.assertEqual(out["details"]["health"], {"status": "ok", "build": "abc123"})
		self.assertEqual(out["details"]["user"], frappe.session.user)
		# sid cookie forwarded.
		_, kwargs = mock_get.call_args
		self.assertEqual(kwargs["cookies"], {"sid": frappe.session.sid})
		self.assertEqual(kwargs["timeout"], 10)

	@patch("requests.get")
	def test_non_200_returns_failure(self, mock_get):
		mock_response = MagicMock()
		mock_response.status_code = 503
		mock_get.return_value = mock_response

		out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("503", out["message"])

	@patch("requests.get", side_effect=requests.exceptions.Timeout())
	def test_timeout_returns_friendly_message(self, _mock_get):
		out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("timeout", out["message"].lower())

	@patch("requests.get", side_effect=requests.exceptions.ConnectionError("nope"))
	def test_connection_error_returns_friendly_message(self, _mock_get):
		out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("Cannot connect", out["message"])

	@patch("requests.get", side_effect=RuntimeError("unexpected"))
	def test_unexpected_error_is_caught_and_logged(self, _mock_get):
		# Should not raise — endpoint always returns a structured response.
		out = health.test_connection()
		self.assertFalse(out["success"])
		self.assertIn("Connection test failed", out["message"])
