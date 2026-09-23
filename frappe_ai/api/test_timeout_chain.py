"""The relay's budget is the setting, the job outlives it, and the sidebar is told the number."""

import inspect
import unittest
from unittest.mock import patch

import frappe

from frappe_ai.ai_assistant.doctype.ai_assistant_settings.ai_assistant_settings import boot_settings
from frappe_ai.api import chat

CONF = {"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}
SETTINGS = "AI Assistant Settings"


def _boot_timeout() -> int:
	bootinfo = frappe._dict()
	boot_settings(bootinfo=bootinfo)
	return bootinfo["frappe_ai"]["timeout"]


def _set_timeout(value) -> None:
	# through the db: validate() refuses 0, which is exactly the unset case under test
	frappe.db.set_single_value(SETTINGS, "timeout", value)
	frappe.clear_document_cache(SETTINGS, SETTINGS)


class TestTimeoutChain(unittest.TestCase):
	def setUp(self):
		# the previous turn's claim on this user's one answer ends with that turn (S13)
		chat._release_the_answer(frappe.session.user)
		self._conf = {k: frappe.local.conf.get(k) for k in CONF}
		frappe.local.conf.update(CONF)
		settings = frappe.get_single(SETTINGS)
		self._enabled, settings.enabled = settings.enabled, 1
		self._timeout = settings.timeout
		settings.save(ignore_version=True)

	def tearDown(self):
		_set_timeout(self._timeout)
		settings = frappe.get_single(SETTINGS)
		settings.enabled = self._enabled
		settings.save(ignore_version=True)
		for key, value in self._conf.items():
			if value is None:
				frappe.local.conf.pop(key, None)
			else:
				frappe.local.conf[key] = value

	@patch("frappe.enqueue")
	def test_the_job_outlives_the_agents_budget_and_the_sidebar_is_told_it(self, enqueue):
		_set_timeout(300)
		chat.start_stream(message="hello")
		self.assertEqual(enqueue.call_args.kwargs["timeout_seconds"], 300)
		self.assertEqual(enqueue.call_args.kwargs["timeout"], 330)
		self.assertEqual(_boot_timeout(), 300)

	@patch("frappe.enqueue")
	def test_a_timeout_left_unset_is_the_fields_own_default(self, enqueue):
		_set_timeout(0)
		chat.start_stream(message="hello")
		self.assertEqual(enqueue.call_args.kwargs["timeout_seconds"], 120)
		self.assertEqual(_boot_timeout(), 120)

	def test_the_relay_job_carries_no_budget_of_its_own(self):
		default = inspect.signature(chat._stream_to_agent).parameters["timeout_seconds"].default
		self.assertIs(default, inspect.Parameter.empty)
