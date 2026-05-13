# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""Tests for frappe_ai.api.chat — both the pure-Python sanitiser and the
whitelisted endpoints (with the agent + RQ enqueue mocked out)."""

import json
import unittest
from unittest.mock import patch

import frappe

from frappe_ai.api import chat


# ──────────────────────────────────────────────────────────────────────────
# _sanitize_page_context — pure-function tests, no DB / no Frappe context
# ──────────────────────────────────────────────────────────────────────────


class TestSanitizePageContext(unittest.TestCase):
	def test_empty_dict_returns_empty(self):
		self.assertEqual(chat._sanitize_page_context({}), {})

	def test_full_valid_dict_passes_through(self):
		raw = {
			"route": "/app/sales-invoice",
			"doctype": "Sales Invoice",
			"docname": "SINV-001",
			"currency": "INR",
		}
		self.assertEqual(chat._sanitize_page_context(raw), raw)

	def test_json_string_input_is_parsed(self):
		raw = json.dumps({"route": "/app", "doctype": "User"})
		self.assertEqual(
			chat._sanitize_page_context(raw),
			{"route": "/app", "doctype": "User"},
		)

	def test_malformed_json_string_returns_empty(self):
		self.assertEqual(chat._sanitize_page_context("{not json"), {})

	def test_non_dict_non_string_returns_empty(self):
		self.assertEqual(chat._sanitize_page_context(None), {})
		self.assertEqual(chat._sanitize_page_context(42), {})
		self.assertEqual(chat._sanitize_page_context([1, 2, 3]), {})
		self.assertEqual(chat._sanitize_page_context(True), {})

	def test_extra_keys_are_dropped(self):
		raw = {"route": "/app", "evil_key": "value", "another": 123}
		self.assertEqual(chat._sanitize_page_context(raw), {"route": "/app"})

	def test_non_string_values_are_dropped(self):
		raw = {"route": "/app", "doctype": 42, "docname": ["list"], "currency": None}
		self.assertEqual(chat._sanitize_page_context(raw), {"route": "/app"})

	def test_empty_string_values_are_dropped(self):
		# Falsy strings get filtered by `if val:` in the impl — keeps the
		# agent payload tidy when the FE forwards a blank context field.
		self.assertEqual(
			chat._sanitize_page_context({"route": "", "doctype": "User"}),
			{"doctype": "User"},
		)

	def test_strings_over_200_chars_are_truncated(self):
		long = "a" * 500
		out = chat._sanitize_page_context({"route": long})
		self.assertEqual(len(out["route"]), 200)
		self.assertTrue(out["route"].startswith("aaaa"))

	def test_nested_dict_value_dropped(self):
		# Whitelist requires string values; a dict for a key is treated
		# the same as any non-string and dropped.
		self.assertEqual(chat._sanitize_page_context({"route": {"nested": "x"}}), {})

	def test_returned_dict_is_independent_of_input(self):
		# Defensive: mutating the output must not mutate the input.
		raw = {"route": "/app", "doctype": "User"}
		out = chat._sanitize_page_context(raw)
		out["route"] = "MUTATED"
		self.assertEqual(raw["route"], "/app")


# ──────────────────────────────────────────────────────────────────────────
# _agent_url — reads site_config; needs frappe.local.conf
# ──────────────────────────────────────────────────────────────────────────


class TestAgentUrl(unittest.TestCase):
	def setUp(self):
		self._original = frappe.local.conf.get("frappe_ai_agent_url")

	def tearDown(self):
		if self._original is None:
			frappe.local.conf.pop("frappe_ai_agent_url", None)
		else:
			frappe.local.conf["frappe_ai_agent_url"] = self._original

	def test_empty_when_unset(self):
		frappe.local.conf.pop("frappe_ai_agent_url", None)
		self.assertEqual(chat._agent_url(), "")

	def test_trailing_slash_stripped(self):
		frappe.local.conf["frappe_ai_agent_url"] = "http://localhost:8484/"
		self.assertEqual(chat._agent_url(), "http://localhost:8484")

	def test_no_trailing_slash_unchanged(self):
		frappe.local.conf["frappe_ai_agent_url"] = "http://localhost:8484"
		self.assertEqual(chat._agent_url(), "http://localhost:8484")

	def test_multiple_trailing_slashes_all_stripped(self):
		frappe.local.conf["frappe_ai_agent_url"] = "http://localhost:8484///"
		self.assertEqual(chat._agent_url(), "http://localhost:8484")


# ──────────────────────────────────────────────────────────────────────────
# start_stream — whitelisted endpoint. Mocks frappe.enqueue.
# ──────────────────────────────────────────────────────────────────────────


class TestStartStream(unittest.TestCase):
	def setUp(self):
		# Establish a known-good baseline for the singleton + site_config.
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

	def test_empty_message_throws(self):
		with self.assertRaises(frappe.ValidationError):
			chat.start_stream(message="")

	def test_whitespace_only_message_throws(self):
		with self.assertRaises(frappe.ValidationError):
			chat.start_stream(message="   \n\t  ")

	def test_message_over_10k_throws(self):
		with self.assertRaises(frappe.ValidationError):
			chat.start_stream(message="x" * 10_001)

	def test_disabled_assistant_throws(self):
		self.settings.enabled = 0
		self.settings.save(ignore_version=True)
		with self.assertRaises(frappe.ValidationError):
			chat.start_stream(message="hello")

	def test_missing_agent_url_throws(self):
		frappe.local.conf.pop("frappe_ai_agent_url", None)
		with self.assertRaises(frappe.ValidationError):
			chat.start_stream(message="hello")

	@patch("frappe.enqueue")
	def test_happy_path_returns_session_id_and_enqueues_worker(self, mock_enqueue):
		result = chat.start_stream(message="hello", page_context={"route": "/app"})
		self.assertIn("session_id", result)
		self.assertEqual(len(result["session_id"]), 36)  # UUID4 string length
		mock_enqueue.assert_called_once()
		# Forwarded message + sanitised page_context land in the enqueue kwargs.
		_, kwargs = mock_enqueue.call_args
		self.assertEqual(kwargs["message"], "hello")
		self.assertEqual(kwargs["page_context"], {"route": "/app"})
		self.assertEqual(kwargs["agent_url"], "http://localhost:8484")
		self.assertEqual(kwargs["queue"], "long")
		self.assertTrue(kwargs["enqueue_after_commit"])

	@patch("frappe.enqueue")
	def test_supplied_session_id_is_reused(self, mock_enqueue):
		result = chat.start_stream(message="hello", session_id="caller-supplied-id")
		self.assertEqual(result["session_id"], "caller-supplied-id")

	@patch("frappe.enqueue")
	def test_malformed_page_context_is_filtered_not_rejected(self, mock_enqueue):
		# Endpoint accepts anything; _sanitize_page_context filters internally.
		chat.start_stream(message="hello", page_context={"junk": "x", "route": "/app"})
		_, kwargs = mock_enqueue.call_args
		self.assertEqual(kwargs["page_context"], {"route": "/app"})


# ──────────────────────────────────────────────────────────────────────────
# get_recent_messages — hydrates the sidebar
# ──────────────────────────────────────────────────────────────────────────


class TestGetRecentMessages(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls._user = frappe.session.user

	def tearDown(self):
		# Clean up any AI Chat Session / Message rows the test created.
		for s in frappe.get_all(
			"AI Chat Session", filters={"user": frappe.session.user}, pluck="name"
		):
			frappe.delete_doc("AI Chat Session", s, ignore_permissions=True, force=True)
		# Cascade for orphan messages just in case.
		for m in frappe.get_all("AI Chat Message", pluck="name"):
			frappe.delete_doc("AI Chat Message", m, ignore_permissions=True, force=True)

	def test_empty_when_no_session(self):
		out = chat.get_recent_messages()
		self.assertEqual(out, {"session_id": None, "messages": []})

	def test_returns_messages_for_most_recent_session(self):
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-1",
				"user": frappe.session.user,
			}
		).insert(ignore_permissions=True)
		for i, role in enumerate(["user", "assistant"]):
			frappe.get_doc(
				{
					"doctype": "AI Chat Message",
					"session": session.name,
					"role": role,
					"content": f"msg-{i}",
				}
			).insert(ignore_permissions=True)
		out = chat.get_recent_messages()
		self.assertEqual(out["session_id"], session.name)
		self.assertEqual(len(out["messages"]), 2)
		self.assertEqual(out["messages"][0]["role"], "user")
		self.assertEqual(out["messages"][0]["content"], "msg-0")

	def test_limit_clamped_to_safe_range(self):
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-limit",
				"user": frappe.session.user,
			}
		).insert(ignore_permissions=True)
		for i in range(5):
			frappe.get_doc(
				{
					"doctype": "AI Chat Message",
					"session": session.name,
					"role": "user",
					"content": f"msg-{i}",
				}
			).insert(ignore_permissions=True)
		# limit=0 → clamped to 1
		out = chat.get_recent_messages(limit=0)
		self.assertEqual(len(out["messages"]), 1)
		# limit=10000 → clamped to 200
		out = chat.get_recent_messages(limit=10000)
		self.assertLessEqual(len(out["messages"]), 200)

	def test_string_limit_coerced_by_frappe_typing(self):
		# Frappe v16 wraps whitelisted endpoints in pydantic-based type
		# validation. A numeric string from the HTTP query layer is
		# coerced to int before the function runs, so a caller-supplied
		# "100" works identically to an integer 100.
		session = frappe.get_doc(
			{
				"doctype": "AI Chat Session",
				"name": "test-session-str-limit",
				"user": frappe.session.user,
			}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "AI Chat Message",
				"session": session.name,
				"role": "user",
				"content": "ok",
			}
		).insert(ignore_permissions=True)
		out = chat.get_recent_messages(limit="100")  # type: ignore[arg-type]
		self.assertEqual(len(out["messages"]), 1)

	def test_unparseable_limit_raises_frappe_type_error(self):
		# Frappe's type validator rejects non-numeric strings upstream of
		# the endpoint body. This documents that contract — callers who
		# want defensive fallback must coerce themselves.
		with self.assertRaises(frappe.exceptions.FrappeTypeError):
			chat.get_recent_messages(limit="not-a-number")  # type: ignore[arg-type]
