"""Each way the agent can fail gets its own line, and the agent's address never reaches a user who cannot act on it."""

import unittest
from unittest.mock import MagicMock, patch

import frappe
import requests

from frappe_ai.api import chat

CONF = {"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}


def _agent(status=200, lines=(), fail=None):
	response = MagicMock(status_code=status)
	if status >= 400:
		response.raise_for_status.side_effect = requests.exceptions.HTTPError(response=response)
	else:
		response.raise_for_status.return_value = None

	def iter_lines(decode_unicode=True):
		yield from lines
		if fail:
			raise fail

	response.iter_lines = iter_lines
	post = MagicMock()
	post.return_value.__enter__.return_value = response
	return post


class TestAgentFailureMessages(unittest.TestCase):
	def _relay(self, post):
		with (
			patch.object(chat, "_take_sid", return_value="x"),
			patch.object(chat.requests, "post", post),
			patch.object(chat, "_is_stream_cancelled", return_value=False),
			patch.object(frappe, "log_error"),
			patch.object(frappe, "publish_realtime") as publish,
		):
			chat._stream_to_agent("a question", "s-1", "u@example.com", "k", "http://agent:8484", 120)
		return publish.call_args_list[-1].args[1]

	def test_a_rejected_session_says_to_sign_in_again(self):
		self.assertEqual(self._relay(_agent(status=401))["message"], chat._SIGNED_OUT)

	def test_an_agent_that_is_out_of_budget_says_to_wait(self):
		self.assertEqual(self._relay(_agent(status=429))["message"], chat._TOO_MANY_QUESTIONS)

	def test_an_agent_that_dies_mid_answer_says_the_answer_was_cut_off(self):
		post = _agent(
			lines=['data: {"type": "content", "text": "half"}'],
			fail=requests.exceptions.ChunkedEncodingError("connection broken"),
		)
		self.assertEqual(self._relay(post)["message"], chat._CUT_OFF)

	def test_an_agent_that_goes_silent_mid_answer_says_it_stopped_part_way(self):
		# requests raises a mid-stream read timeout as ConnectionError, not as Timeout
		post = _agent(
			lines=['data: {"type": "content", "text": "half"}'],
			fail=requests.exceptions.ConnectionError("read timed out"),
		)
		self.assertEqual(self._relay(post)["message"], chat._STOPPED_PART_WAY)

	def test_an_agent_that_never_answers_says_it_is_unreachable(self):
		post = MagicMock(side_effect=requests.exceptions.ConnectionError("refused"))
		self.assertEqual(self._relay(post)["message"], chat._UNREACHABLE)

	def test_a_bug_in_the_relay_is_not_reported_as_an_unreachable_agent(self):
		self.assertEqual(self._relay(_agent(fail=RuntimeError("bug")))["message"], chat._FAILED)

	def test_no_two_kinds_of_failure_share_a_line(self):
		lines = [
			chat._SIGNED_OUT,
			chat._TOO_MANY_QUESTIONS,
			chat._STOPPED_PART_WAY,
			chat._UNREACHABLE,
			chat._CUT_OFF,
		]
		self.assertEqual(len(set(lines)), len(lines))


class TestAgentUrlIsOperatorDetail(unittest.TestCase):
	def setUp(self):
		self._conf = {k: frappe.local.conf.get(k) for k in CONF}
		frappe.local.conf.update(CONF)
		settings = frappe.get_single("AI Assistant Settings")
		self._enabled, settings.enabled = settings.enabled, 1
		settings.save(ignore_version=True)

	def tearDown(self):
		settings = frappe.get_single("AI Assistant Settings")
		settings.enabled = self._enabled
		settings.save(ignore_version=True)
		for key, value in self._conf.items():
			if value is None:
				frappe.local.conf.pop(key, None)
			else:
				frappe.local.conf[key] = value
		frappe.clear_messages()

	def _start_as(self, roles, **conf):
		frappe.local.conf.update(conf)
		with (
			patch.object(frappe, "get_roles", return_value=roles),
			patch.object(frappe, "enqueue"),
			self.assertRaises(frappe.ValidationError) as caught,
		):
			chat.start_stream(message="how many open invoices do I have?")
		return str(caught.exception)

	def test_a_user_who_cannot_fix_it_is_told_only_that_it_is_not_set_up(self):
		message = self._start_as(
			["All"], frappe_ai_agent_url="http://10.0.0.5:8484", frappe_ai_agent_url_unsafe_ok=0
		)
		self.assertEqual(message, "The AI assistant is not set up yet. Contact your administrator.")
		self.assertNotIn("10.0.0.5", message)
		self.assertNotIn("frappe_ai_agent_url", message)

	def test_the_address_does_not_follow_the_plain_line_to_the_browser(self):
		self._start_as(["All"], frappe_ai_agent_url="http://10.0.0.5:8484", frappe_ai_agent_url_unsafe_ok=0)
		self.assertNotIn("10.0.0.5", str(frappe.local.message_log))

	def test_an_unset_url_does_not_name_the_setting_either(self):
		message = self._start_as(["All"], frappe_ai_agent_url="")
		self.assertNotIn("frappe_ai_agent_url", message)

	def test_a_system_manager_is_still_told_which_address_and_which_setting(self):
		message = self._start_as(
			["All", "System Manager"],
			frappe_ai_agent_url="http://10.0.0.5:8484",
			frappe_ai_agent_url_unsafe_ok=0,
		)
		self.assertIn("10.0.0.5", message)
		self.assertIn("frappe_ai_agent_url_unsafe_ok", message)
