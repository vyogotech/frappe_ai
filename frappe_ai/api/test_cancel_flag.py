"""A Stop that lands after an answer's last line must not cancel the next answer on the same chat."""

import unittest
from unittest.mock import patch

import frappe

from frappe_ai.api import chat


class TestCancelFlag(unittest.TestCase):
	def setUp(self):
		self._conf = {
			k: frappe.local.conf.get(k) for k in ("frappe_ai_agent_url", "frappe_ai_agent_url_unsafe_ok")
		}
		frappe.local.conf.update(
			{"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}
		)
		self.settings = frappe.get_single("AI Assistant Settings")
		self._enabled = self.settings.enabled
		self.settings.enabled = 1
		self.settings.save(ignore_version=True)

	def tearDown(self):
		self.settings.enabled = self._enabled
		self.settings.save(ignore_version=True)
		for k, v in self._conf.items():
			if v is None:
				frappe.local.conf.pop(k, None)
			else:
				frappe.local.conf[k] = v

	def test_a_late_stop_does_not_cancel_the_next_answer(self):
		session = frappe.generate_hash(length=12)
		chat.cancel_stream(session)  # the Stop that arrived after the last line
		with patch.object(frappe, "enqueue"):
			chat.start_stream("next question", session_id=session)
		self.assertFalse(chat._is_stream_cancelled(session))
