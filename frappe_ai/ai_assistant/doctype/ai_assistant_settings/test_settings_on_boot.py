# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""The desk boot carries the sidebar's settings, so a desk load makes no settings call of its own."""

import unittest

import frappe
import frappe.sessions
from frappe.utils import set_request

from frappe_ai.ai_assistant.doctype.ai_assistant_settings.ai_assistant_settings import boot_settings

SETTINGS = "AI Assistant Settings"
HOOK = "frappe_ai.ai_assistant.doctype.ai_assistant_settings.ai_assistant_settings.boot_settings"


def _boot() -> dict:
	bootinfo = frappe._dict()
	boot_settings(bootinfo=bootinfo)
	return bootinfo["frappe_ai"]


class TestSettingsOnBoot(unittest.TestCase):
	def setUp(self):
		settings = frappe.get_single(SETTINGS)
		self._original = {
			f: settings.get(f) for f in ("enabled", "timeout", "sidebar_width", "keyboard_shortcut")
		}

	def tearDown(self):
		for field, value in self._original.items():
			frappe.db.set_single_value(SETTINGS, field, value)
		frappe.clear_document_cache(SETTINGS, SETTINGS)

	def _store(self, **fields) -> None:
		# through the db: validate() refuses the empty values that are exactly the unset case under test
		for field, value in fields.items():
			frappe.db.set_single_value(SETTINGS, field, value)
		frappe.clear_document_cache(SETTINGS, SETTINGS)

	def test_a_real_desk_boot_carries_them(self):
		self.assertIn(HOOK, frappe.get_hooks("extend_bootinfo"))
		self._store(enabled=1, sidebar_width=420, keyboard_shortcut="Alt+/")
		set_request(method="GET", path="/app")
		try:
			self.assertEqual(frappe.sessions.get()["frappe_ai"], _boot())
		finally:
			frappe.local.request = None

	def test_the_stored_values_are_what_the_boot_carries(self):
		self._store(enabled=1, timeout=300, sidebar_width=420, keyboard_shortcut="Mod+Shift+A")
		self.assertEqual(
			_boot(),
			{
				"enabled": True,
				"timeout": 300,
				"sidebar_width": 420,
				"keyboard_shortcut": "Mod+Shift+A",
			},
		)

	def test_an_unset_field_falls_back_to_the_doctypes_own_default(self):
		self._store(timeout=0, sidebar_width=0, keyboard_shortcut="")
		boot = _boot()
		self.assertEqual(boot["timeout"], 120)
		self.assertEqual(boot["sidebar_width"], 380)
		self.assertEqual(boot["keyboard_shortcut"], "Alt+/")  # not the reserved Ctrl+/

	def test_disabled_travels_as_a_bool_not_the_stored_int(self):
		self._store(enabled=0)
		self.assertIs(_boot()["enabled"], False)
