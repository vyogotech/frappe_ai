# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""An Error Log row for a chat failure names the chat, so the operator can find the session it belongs to."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe
import requests

from frappe_ai.api import chat, realtime


class TestTheErrorLogNamesTheChat(unittest.TestCase):
	def test_a_failed_relay_names_its_session(self):
		with (
			patch("requests.post", side_effect=requests.exceptions.RequestException("agent down")),
			patch.object(chat, "_take_sid", return_value="sid"),
			patch.object(frappe, "publish_realtime"),
			patch.object(frappe, "log_error") as logged,
		):
			chat._stream_to_agent("q", "session-abc", "bob@example.com", "k", "http://agent:8484", 120)
		self.assertEqual(logged.call_args.kwargs["reference_doctype"], "AI Chat Session")
		self.assertEqual(logged.call_args.kwargs["reference_name"], "session-abc")

	def test_a_relay_that_fails_for_any_other_reason_names_it_too(self):
		with (
			patch("requests.post", side_effect=MemoryError("out of memory")),
			patch.object(chat, "_take_sid", return_value="sid"),
			patch.object(frappe, "publish_realtime"),
			patch.object(frappe, "log_error") as logged,
		):
			chat._stream_to_agent("q", "session-def", "bob@example.com", "k", "http://agent:8484", 120)
		self.assertEqual(logged.call_args.kwargs["reference_name"], "session-def")

	def test_a_failed_broadcast_names_its_session(self):
		with (
			patch.object(frappe.db, "get_value", side_effect=RuntimeError("db gone")),
			patch.object(frappe, "log_error") as logged,
		):
			realtime.broadcast_message_added(SimpleNamespace(session="session-xyz"))
		self.assertEqual(logged.call_args.kwargs["reference_doctype"], "AI Chat Session")
		self.assertEqual(logged.call_args.kwargs["reference_name"], "session-xyz")
