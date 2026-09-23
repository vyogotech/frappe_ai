"""ADR-006: the pause is recorded here, and only a user's click turns it into a write."""

import json
import unittest
from unittest.mock import MagicMock, patch

import frappe

from frappe_ai.api import chat, confirm

CONF = {"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}
ARGS = {"doctype": "ToDo", "name": "TOD-0001", "description": "pay the invoice"}
OTHER_USER = "someone.else@example.com"


def _agent(*lines):
	response = MagicMock()
	response.iter_lines = lambda decode_unicode=True: iter(lines)
	post = MagicMock()
	post.return_value.__enter__.return_value = response
	return post


class TestConfirm(unittest.TestCase):
	def setUp(self):
		self._conf = {k: frappe.local.conf.get(k) for k in CONF}
		frappe.local.conf.update(CONF)
		chat._release_the_answer(frappe.session.user)
		self.id = frappe.generate_hash(length=16)
		self.session = frappe.generate_hash(length=12)
		self.pending_key = confirm._PENDING_KEY_PREFIX + self.id

	def tearDown(self):
		chat._release_the_answer(frappe.session.user)
		frappe.cache.delete_value(self.pending_key)
		for key, value in self._conf.items():
			if value is None:
				frappe.local.conf.pop(key, None)
			else:
				frappe.local.conf[key] = value

	def _record(self, user: str | None = None, tool: str = "create_document") -> None:
		confirm.record_pending(
			{"id": self.id, "name": tool, "arguments": ARGS},
			user or frappe.session.user,
			self.session,
		)

	def _mint(self, **overrides) -> str:
		token = frappe.generate_hash(length=confirm._TOKEN_LENGTH)
		grant = {
			"user": frappe.session.user,
			"session": self.session,
			"tool": "create_document",
			"doctype": "ToDo",
			"name": "TOD-0001",
		}
		grant.update(overrides)
		frappe.cache.set_value(
			confirm._TOKEN_KEY_PREFIX + confirm._hash(token), json.dumps(grant), expires_in_sec=120
		)
		return token

	# ── the relay ───────────────────────────────────────────────────────────

	def test_the_relay_records_the_call_the_agent_paused_on(self):
		line = "data: " + json.dumps(
			{"type": "tool_confirm", "id": self.id, "name": "create_document", "arguments": ARGS}
		)
		with (
			patch.object(chat, "_take_sid", return_value="x"),
			patch.object(chat.requests, "post", _agent(line, 'data: {"type": "done"}')),
			patch.object(frappe, "publish_realtime") as publish,
		):
			chat._stream_to_agent(
				"create a todo", self.session, frappe.session.user, "k", "http://agent:8484", 30
			)

		self.assertEqual(
			confirm._read(self.pending_key),
			{
				"user": frappe.session.user,
				"session": self.session,
				"tool": "create_document",
				"arguments": ARGS,
			},
		)
		# and the chunk still reaches the browser unchanged, carrying the id the click will name
		self.assertEqual(publish.call_args_list[0].args[1]["id"], self.id)

	def test_a_confirmed_turn_carries_the_stored_call_and_no_message(self):
		post = _agent('data: {"type": "done"}')
		with (
			patch.object(chat, "_take_sid", return_value="x"),
			patch.object(chat.requests, "post", post),
			patch.object(frappe, "publish_realtime") as publish,
		):
			chat._stream_to_agent(
				"",
				self.session,
				frappe.session.user,
				"k",
				"http://agent:8484",
				30,
				confirmation={"tool": "create_document", "arguments": ARGS, "token_key": "handoff"},
			)

		body = post.call_args.kwargs["json"]
		self.assertNotIn("message", body)
		# the job carried the key; the worker reads the token out of the cache (mocked here) and sends that
		self.assertEqual(body["confirmation"], {"tool": "create_document", "arguments": ARGS, "token": "x"})
		# the token goes to the agent and to nobody else: not to the browser, not into a chunk
		self.assertNotIn("x", json.dumps([c.args[1] for c in publish.call_args_list]))

	# ── respond ─────────────────────────────────────────────────────────────

	def test_an_id_with_no_record_reads_the_expired_line(self):
		with patch.object(frappe, "enqueue") as enqueue, self.assertRaises(frappe.ValidationError) as caught:
			confirm.respond(self.id, "allow")
		self.assertIn(confirm._EXPIRED, str(caught.exception))
		enqueue.assert_not_called()

	def test_another_users_pending_write_is_not_answerable(self):
		self._record(user=OTHER_USER)
		with patch.object(frappe, "enqueue") as enqueue, self.assertRaises(frappe.ValidationError) as caught:
			confirm.respond(self.id, "allow")
		self.assertIn(confirm._EXPIRED, str(caught.exception))
		enqueue.assert_not_called()
		# left where it is: the owner can still answer it
		self.assertIsNotNone(confirm._read(self.pending_key))

	def test_a_decision_that_is_neither_allow_nor_deny_is_refused(self):
		self._record()
		with self.assertRaises(frappe.ValidationError):
			confirm.respond(self.id, "Allow")
		self.assertIsNotNone(confirm._read(self.pending_key))

	def test_deny_drops_the_write_and_asks_the_agent_for_nothing(self):
		self._record()
		with patch.object(frappe, "enqueue") as enqueue:
			self.assertEqual(confirm.respond(self.id, "deny"), {"ok": True})
		enqueue.assert_not_called()
		self.assertIsNone(confirm._read(self.pending_key))

	def test_allow_runs_the_stored_call_with_a_token_kept_only_as_its_hash(self):
		self._record()
		with patch.object(frappe, "enqueue") as enqueue:
			self.assertEqual(confirm.respond(self.id, "allow"), {"ok": True})

		kwargs = enqueue.call_args.kwargs
		self.assertEqual(kwargs["session_id"], self.session)
		self.assertEqual(kwargs["message"], "")
		self.assertEqual(kwargs["confirmation"]["tool"], "create_document")
		self.assertEqual(kwargs["confirmation"]["arguments"], ARGS)

		# RQ keeps a job's arguments and shows them to System Managers, so the job carries a key, not the token
		self.assertNotIn("token", kwargs["confirmation"])
		token = chat._take_sid(kwargs["confirmation"]["token_key"], chat._TOKEN_HANDOFF_PREFIX)
		self.assertEqual(len(token), confirm._TOKEN_LENGTH)
		# and the handoff is spent: a second worker reading the same key gets nothing
		self.assertEqual(chat._take_sid(kwargs["confirmation"]["token_key"], chat._TOKEN_HANDOFF_PREFIX), "")
		# the cache holds the hash and only the hash, so a dump of it grants nothing
		self.assertIsNone(frappe.cache.get_value(confirm._TOKEN_KEY_PREFIX + token, use_local_cache=False))
		self.assertEqual(
			confirm._read(confirm._TOKEN_KEY_PREFIX + confirm._hash(token)),
			{
				"user": frappe.session.user,
				"session": self.session,
				"tool": "create_document",
				"doctype": "ToDo",
				"name": "TOD-0001",
			},
		)
		self.assertNotIn(token, json.dumps(kwargs["confirmation"]["arguments"]))
		self.assertIsNone(confirm._read(self.pending_key))

	def test_the_loser_of_two_clicks_reads_the_expired_line(self):
		self._record()
		with patch.object(frappe, "enqueue") as enqueue:
			confirm.respond(self.id, "allow")
			chat._release_the_answer(frappe.session.user)  # the confirmed turn ended
			with self.assertRaises(frappe.ValidationError) as caught:
				confirm.respond(self.id, "allow")
		self.assertIn(confirm._EXPIRED, str(caught.exception))
		enqueue.assert_called_once()

	def test_a_click_while_an_answer_is_running_leaves_the_card_answerable(self):
		self._record()
		chat._claim_the_answer(frappe.session.user, 30)
		with patch.object(frappe, "enqueue") as enqueue, self.assertRaises(frappe.ValidationError) as caught:
			confirm.respond(self.id, "allow")
		self.assertIn("already in progress", str(caught.exception))
		enqueue.assert_not_called()
		self.assertIsNotNone(confirm._read(self.pending_key))

	# ── redeem ──────────────────────────────────────────────────────────────

	def test_a_token_is_spent_once(self):
		token = self._mint()
		self.assertEqual(confirm.redeem(token, "create_document", "ToDo", "TOD-0001"), {"ok": True})
		with self.assertRaises(frappe.ValidationError) as caught:
			confirm.redeem(token, "create_document", "ToDo", "TOD-0001")
		self.assertIn(confirm._EXPIRED, str(caught.exception))

	def test_a_token_is_bound_to_the_call_it_was_minted_from(self):
		for call in (
			("delete_document", "ToDo", "TOD-0001"),
			("create_document", "Sales Invoice", "TOD-0001"),
			("create_document", "ToDo", "TOD-0002"),
			("create_document", "ToDo", ""),
		):
			with self.subTest(call=call):
				token = self._mint()
				with self.assertRaises(frappe.ValidationError):
					confirm.redeem(token, *call)
				# spent even though it was refused, so one token buys one guess
				self.assertIsNone(confirm._read(confirm._TOKEN_KEY_PREFIX + confirm._hash(token)))

	def test_a_token_minted_for_another_user_is_refused(self):
		token = self._mint(user=OTHER_USER)
		with self.assertRaises(frappe.ValidationError):
			confirm.redeem(token, "create_document", "ToDo", "TOD-0001")

	def test_a_guessed_token_reads_the_same_line_as_an_expired_one(self):
		with self.assertRaises(frappe.ValidationError) as caught:
			confirm.redeem(
				frappe.generate_hash(length=confirm._TOKEN_LENGTH), "create_document", "ToDo", "TOD-0001"
			)
		self.assertIn(confirm._EXPIRED, str(caught.exception))
