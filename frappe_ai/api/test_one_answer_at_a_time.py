"""One answer at a time per user: a second tab, the other frontend or a direct call is refused."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from frappe_ai.api import chat

CONF = {"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}


class TestOneAnswerAtATime(unittest.TestCase):
	def setUp(self):
		self._conf = {k: frappe.local.conf.get(k) for k in CONF}
		frappe.local.conf.update(CONF)
		settings = frappe.get_single("AI Assistant Settings")
		self._enabled, settings.enabled = settings.enabled, 1
		settings.save(ignore_version=True)

	def tearDown(self):
		chat._release_the_answer(frappe.session.user)
		settings = frappe.get_single("AI Assistant Settings")
		settings.enabled = self._enabled
		settings.save(ignore_version=True)
		for key, value in self._conf.items():
			if value is None:
				frappe.local.conf.pop(key, None)
			else:
				frappe.local.conf[key] = value

	def test_the_relay_job_is_named_after_the_user(self):
		with patch.object(frappe, "enqueue") as enqueue:
			chat.start_stream(message="how many open invoices do I have?")
		self.assertEqual(enqueue.call_args.kwargs["job_id"], f"frappe_ai:stream:{frappe.session.user}")

	def test_a_second_answer_while_one_is_running_is_refused(self):
		with patch.object(frappe, "enqueue") as enqueue:
			chat.start_stream(message="how many open invoices do I have?")
			with self.assertRaises(frappe.ValidationError) as caught:
				chat.start_stream(message="and how many are overdue?")
		self.assertIn("already in progress", str(caught.exception))
		self.assertEqual(enqueue.call_count, 1)

	def test_two_starts_racing_leave_one_winner(self):
		# the job reaches RQ only after the request commits, so a check against RQ would let both through;
		# the claim is a single SET NX, which is why this passes
		user = frappe.session.user
		ttl = 30
		self.assertTrue(chat._claim_the_answer(user, ttl))
		self.assertFalse(chat._claim_the_answer(user, ttl))
		chat._release_the_answer(user)
		self.assertTrue(chat._claim_the_answer(user, ttl))

	def test_the_relay_releases_the_claim_when_the_turn_ends(self):
		user = frappe.session.user
		with patch.object(frappe, "enqueue"):
			chat.start_stream(message="how many open invoices do I have?")
		with patch.object(chat.requests, "post", side_effect=OSError("the agent is away")):
			chat._stream_to_agent(
				message="how many open invoices do I have?",
				session_id=frappe.generate_hash(length=12),
				user=user,
				sid_key="",
				agent_url="http://localhost:8484",
				timeout_seconds=5,
			)
		with patch.object(frappe, "enqueue") as enqueue:
			chat.start_stream(message="and how many are overdue?")
		enqueue.assert_called_once()

	def test_a_refused_second_answer_does_not_disarm_the_running_answers_stop(self):
		session = frappe.generate_hash(length=12)
		with patch.object(frappe, "enqueue"):
			chat.start_stream("the answer that is running", session_id=session)
		chat.cancel_stream(session)  # the Stop the user just pressed on it
		with patch.object(frappe, "enqueue"), self.assertRaises(frappe.ValidationError):
			chat.start_stream("a question from a second tab", session_id=session)
		self.assertTrue(chat._is_stream_cancelled(session))

	def test_a_burst_of_starts_hits_frappes_rate_limiter(self):
		# frappe.rate_limiter only counts inside a request, so this test has to look like one
		frappe.local.request = SimpleNamespace(method="POST")
		frappe.local.request_ip = "198.51.100." + frappe.generate_hash(length=6)
		frappe.local.form_dict.cmd = "frappe_ai.api.chat.start_stream"
		try:
			with patch.object(frappe, "enqueue"):
				for _i in range(chat._STARTS_PER_MINUTE):
					chat._release_the_answer(
						frappe.session.user
					)  # the burst is what is counted, not the claim
					chat.start_stream(message="how many open invoices do I have?")
				chat._release_the_answer(frappe.session.user)
				with self.assertRaises(frappe.RateLimitExceededError):
					chat.start_stream(message="how many open invoices do I have?")
		finally:
			frappe.local.form_dict.pop("cmd", None)
			del frappe.local.request
