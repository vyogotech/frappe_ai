# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""frappe_ai writes its own chat rows and hands the agent the turns before this one (ADR-011)."""

import json
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_ai.api import chat

USER = "history_writer@example.com"


def _agent(*lines):
	"""A requests.post whose response streams `lines` as the agent's SSE frames."""
	response = MagicMock()
	response.iter_lines = lambda decode_unicode=True: iter(lines)
	post = MagicMock()
	post.return_value.__enter__.return_value = response
	return post


def _frame(**fields):
	return "data: " + json.dumps(fields)


class TestFrappeAIWritesTheChat(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("User", USER):
			user = {"doctype": "User", "email": USER, "first_name": "History", "send_welcome_email": 0}
			frappe.get_doc(user | {"roles": [{"role": "All"}]}).insert(ignore_permissions=True)

	def setUp(self):
		super().setUp()
		frappe.set_user(USER)
		self.addCleanup(frappe.set_user, "Administrator")
		self.session = frappe.generate_hash(length=12)
		self.addCleanup(self._drop_the_chat)
		self.settings = MagicMock(enabled=True)
		self.settings.agent_timeout.return_value = 30

	def _drop_the_chat(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("AI Chat Session", self.session):
			frappe.delete_doc("AI Chat Session", self.session, ignore_permissions=True, force=True)

	def _start(self, message):
		"""Run start_stream for this chat and return the job arguments the worker would be given."""
		with ExitStack() as patched:
			for scope in (
				patch.object(frappe, "get_single", return_value=self.settings),
				patch.object(chat, "_check_agent_url"),
				patch.object(chat, "_agent_url", return_value="http://agent:8484"),
				patch.object(chat, "_default_currency", return_value=""),
			):
				patched.enter_context(scope)
			enqueue = patched.enter_context(patch.object(frappe, "enqueue"))
			chat.start_stream(message=message, session_id=self.session)
		# the worker that would release it never runs here
		chat._release_the_answer(frappe.session.user)
		return enqueue.call_args.kwargs

	def _rows(self):
		return frappe.get_all(
			"AI Chat Message",
			filters={"session": self.session},
			fields=["role", "content", "tool_result_json"],
			order_by="creation asc, name asc",
		)

	def _relay(self, *lines, job=None):
		"""Run the relay over `lines` and return the request body the agent was sent."""
		post = _agent(*lines)
		with (
			patch.object(chat, "_take_sid", return_value="sid"),
			patch.object(chat.requests, "post", post),
			patch.object(chat, "_is_stream_cancelled", return_value=False),
			patch.object(frappe, "publish_realtime"),
		):
			chat._stream_to_agent(**(job if job is not None else self._start("what is the total")))
		return post.call_args.kwargs["json"]

	def test_the_question_is_a_row_before_the_worker_is_enqueued(self):
		self._start("what is the total")
		self.assertEqual(frappe.db.get_value("AI Chat Session", self.session, "user"), USER)
		self.assertEqual([(r.role, r.content) for r in self._rows()], [("user", "what is the total")])

	def test_a_second_turn_adds_one_row_not_two(self):
		self._start("what is the total")
		self._start("and last month")
		self.assertEqual(len(self._rows()), 2)

	def test_the_chat_is_named_after_its_first_question(self):
		self._start("what is the total " + "x" * 200)
		self.assertEqual(len(frappe.db.get_value("AI Chat Session", self.session, "title")), 60)

	def test_a_relayed_done_saves_the_answer_with_its_sources_blocks_and_usage(self):
		self._relay(
			_frame(type="content", text="1,240.00"),
			_frame(type="sources", items=[{"file": "ledger.pdf", "seq": 3, "text": "a passage"}]),
			_frame(type="content_block", block={"kind": "table", "rows": []}),
			_frame(type="done", tools_called=["search"], usage={"output_tokens": 31}),
		)
		answer = self._rows()[-1]
		self.assertEqual((answer.role, answer.content), ("assistant", "1,240.00"))
		saved = json.loads(answer.tool_result_json)
		self.assertEqual(set(saved), {"sources", "blocks", "usage"})
		# the file and the passage's place in it, never the passage itself
		self.assertEqual(saved["sources"], [{"file": "ledger.pdf", "seq": 3, "distance": None}])
		self.assertEqual(saved["blocks"], [{"kind": "table", "rows": []}])
		self.assertEqual(saved["usage"], {"output_tokens": 31})

	def test_a_turn_the_agent_never_ended_leaves_the_answer_to_the_agent(self):
		self._relay(_frame(type="content", text="half an ans"))
		self.assertEqual([r.role for r in self._rows()], ["user"])

	def test_the_request_body_carries_the_prior_turns_oldest_first(self):
		self._relay(_frame(type="content", text="1,240.00"), _frame(type="done", tools_called=[]))
		body = self._relay(job=self._start("and last month"))
		self.assertEqual(
			body["history"],
			[
				{"role": "user", "content": "what is the total"},
				{"role": "assistant", "content": "1,240.00"},
			],
		)

	def test_the_question_being_asked_is_not_also_a_prior_turn(self):
		self.assertEqual(self._relay(_frame(type="done", tools_called=[]))["history"], [])

	def test_a_failed_turns_error_row_is_not_replayed_as_an_answer(self):
		self._relay(_frame(type="error", message="Answer failed."), _frame(type="done", tools_called=[]))
		self.assertEqual(self._rows()[-1].content, "[error] Answer failed.")
		body = self._relay(job=self._start("try again"))
		self.assertEqual(body["history"], [{"role": "user", "content": "what is the total"}])

	def test_the_answer_row_is_written_before_the_browser_is_told_the_turn_ended(self):
		# a row inserted after `done` reaches the tab as msg_added with an id it cannot match, and
		# the answer it has just watched stream in renders a second time
		rows_when_done_went_out = []

		def publish(event, message=None, user=None, after_commit=False):
			if isinstance(message, dict) and message.get("type") == "done":
				filters = {"session": self.session, "role": "assistant"}
				rows_when_done_went_out.append(frappe.db.count("AI Chat Message", filters))

		post = _agent(_frame(type="content", text="1,240.00"), _frame(type="done", tools_called=[]))
		with (
			patch.object(chat, "_take_sid", return_value="sid"),
			patch.object(chat.requests, "post", post),
			patch.object(chat, "_is_stream_cancelled", return_value=False),
			patch.object(frappe, "publish_realtime", publish),
		):
			chat._stream_to_agent(**self._start("what is the total"))
		self.assertEqual(rows_when_done_went_out, [1])

	def test_a_session_id_that_is_not_the_callers_is_refused(self):
		frappe.set_user("Administrator")
		frappe.get_doc({"doctype": "AI Chat Session", "name": self.session}).insert()
		frappe.set_user(USER)
		with self.assertRaises(frappe.PermissionError):
			self._start("what is in someone else's chat")
