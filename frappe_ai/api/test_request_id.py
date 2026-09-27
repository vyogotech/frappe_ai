# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""One id per question, from the browser's request to the agent and onto this app's own lines (ADR-008)."""

import unittest
import uuid
from unittest.mock import MagicMock, patch

import frappe
import requests

from frappe_ai.api import chat, confirm

# the shape the check mints: uuid4().hex, which frappe's own TRACE_ID_PATTERN adopts from a browser
RID = "6f1c0b5e9a7d4c3b8e2f1a0d9c8b7a65"


def _agent(*lines):
	"""A requests.post whose response streams `lines` as the agent's SSE frames."""
	response = MagicMock()
	response.iter_lines = lambda decode_unicode=True: iter(lines)
	post = MagicMock()
	post.return_value.__enter__.return_value = response
	return post


class _OneRequestPerCase(unittest.TestCase):
	"""_request_id memoises on frappe.flags, which outlives a test here: each case is its own request."""

	def setUp(self):
		frappe.flags.ai_request_id = ""
		self.addCleanup(frappe.flags.pop, "ai_request_id", None)


class TestTheIdIsTheRequestsOwn(_OneRequestPerCase):
	def test_the_requests_trace_id_is_used_where_there_is_one(self):
		with patch.object(frappe.monitor, "get_trace_id", return_value=RID):
			self.assertEqual(chat._request_id(), RID)

	def test_one_is_minted_where_there_is_none(self):
		with patch.object(frappe.monitor, "get_trace_id", return_value=None):
			minted = chat._request_id()
		# ADR-008's canonical 8-4-4-4-12, which satisfies frappe's [0-9a-fA-F-]{8,64} and the
		# agent's [A-Za-z0-9._-]{1,64} by construction
		self.assertEqual(str(uuid.UUID(minted)), minted)

	def test_one_request_is_one_id(self):
		# without the memo, every line of a request on a site with no monitor carries a different id
		with patch.object(frappe.monitor, "get_trace_id", return_value=None):
			self.assertEqual(chat._request_id(), chat._request_id())


class TestTheAgentIsToldTheId(_OneRequestPerCase):
	def _relay(self, post, request_id=RID):
		"""Run the relay with `post` as the agent; returns its logger and the frappe.log_error mock."""
		logger = MagicMock()
		with (
			patch.object(chat, "_take_sid", return_value="sid"),
			patch.object(chat, "_prior_turns", return_value=[]),
			patch.object(chat, "_is_stream_cancelled", return_value=False),
			patch.object(chat, "_save_the_answer"),
			patch.object(chat, "_release_the_answer"),
			patch.object(chat, "_logger", return_value=logger),
			patch.object(chat.requests, "post", post),
			patch.object(frappe, "publish_realtime"),
			patch.object(frappe, "log_error") as logged,
		):
			chat._stream_to_agent(
				"q", "s-1", "u@example.com", "k", "http://agent:8484", 120, request_id=request_id
			)
		return logger, logged

	def test_the_agent_is_sent_it_under_the_header_it_already_parses(self):
		post = _agent('data: {"type": "done"}')
		self._relay(post)
		self.assertEqual(post.call_args.kwargs["headers"]["X-Request-ID"], RID)

	def test_every_line_the_relay_writes_carries_it(self):
		logger, _ = self._relay(_agent('data: {"type": "done"}'))
		lines = [call.args[0] % call.args[1:] for call in logger.info.call_args_list]
		self.assertTrue(lines, "the relay wrote no log line at all")
		for line in lines:
			self.assertIn(f"rid={RID}", line)

	def test_a_failed_relay_puts_it_on_the_error_log_row(self):
		# frappe stamps trace_id from get_trace_id(), which in a job is the job's own uuid, not this one
		_, logged = self._relay(MagicMock(side_effect=requests.exceptions.ConnectionError("agent down")))
		self.assertIn(f"rid={RID}", logged.call_args.kwargs["message"])


class TestTheJobIsGivenTheId(_OneRequestPerCase):
	def test_start_stream_hands_the_relay_the_id_and_returns_it(self):
		settings = MagicMock(enabled=True)
		settings.agent_timeout.return_value = 30
		with (
			patch.object(frappe.monitor, "get_trace_id", return_value=RID),
			patch.object(frappe, "get_single", return_value=settings),
			patch.object(chat, "_claim_the_answer", return_value=True),
			patch.object(chat, "_release_the_answer"),
			patch.object(chat, "_agent_url", return_value="http://agent:8484"),
			patch.object(chat, "_check_agent_url"),
			patch.object(chat, "_default_currency", return_value=""),
			patch.object(chat, "_open_session"),
			patch.object(chat, "_save_message", return_value="row-1"),
			patch.object(frappe, "enqueue") as enqueue,
		):
			started = chat.start_stream(message="what is the total", session_id="s-1")
		self.assertEqual(enqueue.call_args.kwargs["request_id"], RID)
		self.assertEqual(started["request_id"], RID)

	def test_a_confirmed_write_is_relayed_under_an_id_too(self):
		# the other enqueue of the relay: without one, the turn a click starts reaches the agent anonymous
		record = {"user": frappe.session.user, "session": "s-1", "tool": "t", "arguments": {}}
		settings = MagicMock()
		settings.agent_timeout.return_value = 30
		with (
			patch.object(frappe.monitor, "get_trace_id", return_value=RID),
			patch.object(confirm, "_read", return_value=record),
			patch.object(confirm, "_pop", return_value=True),
			patch.object(frappe, "get_single", return_value=settings),
			patch.object(confirm, "_claim_the_answer", return_value=True),
			patch.object(confirm, "_release_the_answer"),
			patch.object(confirm, "_agent_url", return_value="http://agent:8484"),
			patch.object(confirm, "_check_agent_url"),
			patch.object(frappe, "enqueue") as enqueue,
		):
			confirm.respond("c-1", "allow")
		self.assertEqual(enqueue.call_args.kwargs["request_id"], RID)
