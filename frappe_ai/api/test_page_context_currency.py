"""The agent is told which currency to answer in, even on a page whose document names none."""

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.cache_manager import clear_defaults_cache

from frappe_ai.api import chat

CONF = {"frappe_ai_agent_url": "http://localhost:8484", "frappe_ai_agent_url_unsafe_ok": 1}
PAGE = {"route": "app/item/ITEM-0001", "doctype": "Item", "docname": "ITEM-0001"}


class TestDefaultCurrency(unittest.TestCase):
	def tearDown(self):
		frappe.db.rollback()
		clear_defaults_cache()

	def test_the_site_default_when_erpnext_is_not_installed(self):
		frappe.db.set_default("currency", "EUR")
		clear_defaults_cache()
		self.assertEqual(chat._default_currency(), "EUR")

	def test_nothing_when_the_site_names_no_currency(self):
		with patch.object(frappe.db, "get_default", return_value=None):
			self.assertEqual(chat._default_currency(), "")

	def test_the_users_company_beats_the_site_default(self):
		# a multi-company site: the site was set up in INR and this user's company keeps its books in USD
		frappe.db.set_default("currency", "INR")
		clear_defaults_cache()
		erpnext = SimpleNamespace(get_default_currency=lambda: "USD")
		with (
			patch.object(frappe, "get_installed_apps", return_value=["frappe", "erpnext", "frappe_ai"]),
			patch.dict(sys.modules, {"erpnext": erpnext}),
		):
			self.assertEqual(chat._default_currency(), "USD")

	def test_the_site_default_when_the_user_has_no_company(self):
		frappe.db.set_default("currency", "INR")
		clear_defaults_cache()
		erpnext = SimpleNamespace(get_default_currency=lambda: None)
		with (
			patch.object(frappe, "get_installed_apps", return_value=["frappe", "erpnext", "frappe_ai"]),
			patch.dict(sys.modules, {"erpnext": erpnext}),
		):
			self.assertEqual(chat._default_currency(), "INR")


class TestStartStreamCurrency(unittest.TestCase):
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

	def _start(self, page_context):
		with patch.object(frappe, "enqueue") as enqueue:
			result = chat.start_stream(message="what did we sell last month?", page_context=page_context)
		return result, enqueue.call_args.kwargs["page_context"]

	def test_a_page_without_a_currency_gets_the_default_one(self):
		with patch.object(chat, "_default_currency", return_value="USD"):
			result, sent = self._start(PAGE)
		self.assertEqual(sent["currency"], "USD")
		self.assertEqual(result["currency"], "USD")

	def test_the_open_documents_own_currency_is_kept(self):
		with patch.object(chat, "_default_currency", return_value="USD"):
			result, sent = self._start({**PAGE, "doctype": "Sales Invoice", "currency": "GBP"})
		self.assertEqual(sent["currency"], "GBP")
		self.assertEqual(result["currency"], "GBP")

	def test_no_currency_is_sent_when_none_can_be_found(self):
		with patch.object(chat, "_default_currency", return_value=""):
			result, sent = self._start(PAGE)
		self.assertNotIn("currency", sent)
		self.assertEqual(result["currency"], "")
