"""Whatever stops the relay, the browser gets an end: otherwise the user waits out the silence timer."""

import unittest
from unittest.mock import MagicMock, patch

import frappe

from frappe_ai.api import chat


def _agent(*lines, fail=None):
	response = MagicMock()

	def iter_lines(decode_unicode=True):
		yield from lines
		if fail:
			raise fail

	response.iter_lines = iter_lines
	post = MagicMock()
	post.return_value.__enter__.return_value = response
	return post


class TestRelayEnd(unittest.TestCase):
	def _relay(self, post):
		with (
			patch.object(chat, "_take_sid", return_value="x"),
			patch.object(chat.requests, "post", post),
			patch.object(chat, "_is_stream_cancelled", return_value=False),
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe, "log_error") as self.logged,
		):
			chat._stream_to_agent("the private question", "s-1", "u@example.com", "k", "http://agent:8484")
		return [c.args[1]["type"] for c in publish.call_args_list]

	def test_an_unexpected_failure_still_ends_the_stream(self):
		self.assertEqual(
			self._relay(_agent('data: {"type": "content"}', fail=RuntimeError("job timeout")))[-1], "error"
		)

	def test_a_failure_is_logged_without_the_question(self):
		self._relay(_agent(fail=RuntimeError("job timeout")))
		self.assertNotIn("the private question", str(self.logged.call_args))
		# without a message, Frappe logs every frame's variables
		self.assertIn("RuntimeError: job timeout", self.logged.call_args.kwargs["message"])

	def test_an_agent_that_fails_is_logged_with_the_stack(self):
		self._relay(_agent(fail=chat.requests.ConnectionError("agent down")))
		self.assertIn("chat.py", self.logged.call_args.kwargs["message"])

	def test_a_chunk_that_is_not_an_object_is_skipped(self):
		events = self._relay(_agent("data: [1, 2]", 'data: {"type": "content"}'))
		self.assertEqual(events, ["content", "done"])

	def test_an_agent_that_is_down_fails_the_connect_in_seconds(self):
		post = _agent('data: {"type": "done"}')
		self._relay(post)
		self.assertLessEqual(post.call_args.kwargs["timeout"][0], 5)
