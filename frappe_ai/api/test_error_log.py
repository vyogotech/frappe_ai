"""An unexpected failure is logged with the stack that says where it happened, not only its message."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from frappe_ai.api import health, realtime


class TestErrorLog(unittest.TestCase):
	def test_the_connection_test_logs_the_stack(self):
		with (
			patch.object(frappe, "get_single", return_value=SimpleNamespace(enabled=1)),
			patch.object(health, "_agent_url", return_value="http://agent:8484"),
			patch.object(health, "_validate_agent_url"),
			patch.object(
				health.requests,
				"get",
				side_effect=health.requests.exceptions.TooManyRedirects("unexpected"),
			),
			patch.object(frappe, "log_error") as logged,
		):
			health.test_connection()
		self.assertIn("health.py", logged.call_args.kwargs["message"])

	def test_a_failed_broadcast_logs_the_stack(self):
		with patch.object(frappe, "log_error") as logged:
			realtime.broadcast_message_added(SimpleNamespace())
		self.assertIn("realtime.py", logged.call_args.kwargs["message"])
