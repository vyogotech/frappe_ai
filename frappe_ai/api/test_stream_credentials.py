"""The relay job never holds the user's session id; it carries a key the worker can use once."""

import json
import unittest
from unittest.mock import patch

import frappe

from frappe_ai.api import chat

CONF = {"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}


class TestTheJobHoldsNoSid(unittest.TestCase):
	def setUp(self):
		self._conf = {k: frappe.local.conf.get(k) for k in CONF}
		frappe.local.conf.update(CONF)
		settings = frappe.get_single("AI Assistant Settings")
		self._enabled, settings.enabled = settings.enabled, 1
		settings.save(ignore_version=True)
		self._sid, frappe.session.sid = frappe.session.sid, "sid-" + frappe.generate_hash(length=20)

	def tearDown(self):
		frappe.session.sid = self._sid
		settings = frappe.get_single("AI Assistant Settings")
		settings.enabled = self._enabled
		settings.save(ignore_version=True)
		for key, value in self._conf.items():
			if value is None:
				frappe.local.conf.pop(key, None)
			else:
				frappe.local.conf[key] = value

	@patch("frappe.publish_realtime")
	@patch("requests.post")
	@patch("frappe.enqueue")
	def test_the_worker_gets_the_sid_once_and_the_job_never_holds_it(self, enqueue, post, _publish):
		sid = frappe.session.sid
		chat.start_stream(message="hello")
		job = {
			k: v
			for k, v in enqueue.call_args.kwargs.items()
			if k not in ("queue", "timeout", "enqueue_after_commit")
		}
		# RQ keeps these arguments for days and shows them to System Managers, and a failed job's traceback keeps them
		self.assertNotIn(sid, json.dumps(job, default=str))

		post.return_value.__enter__.return_value.iter_lines.return_value = ['data: {"type": "done"}']
		chat._stream_to_agent(**job)
		self.assertEqual(post.call_args.kwargs["cookies"], {"sid": sid})
		chat._stream_to_agent(**job)
		self.assertNotEqual(post.call_args.kwargs["cookies"], {"sid": sid})
