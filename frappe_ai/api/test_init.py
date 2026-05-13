# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""Tests for frappe_ai.api.get_settings — the frontend bootstrap endpoint."""

import unittest

import frappe

from frappe_ai import api


class TestGetSettings(unittest.TestCase):
	def setUp(self):
		self.settings = frappe.get_single("AI Assistant Settings")
		self._original = {
			"enabled": self.settings.enabled,
			"sidebar_width": self.settings.sidebar_width,
			"keyboard_shortcut": self.settings.keyboard_shortcut,
		}

	def tearDown(self):
		settings = frappe.get_single("AI Assistant Settings")
		for k, v in self._original.items():
			setattr(settings, k, v)
		settings.save(ignore_version=True)

	def test_returns_current_values(self):
		settings = frappe.get_single("AI Assistant Settings")
		settings.enabled = 1
		settings.sidebar_width = 420
		settings.keyboard_shortcut = "Mod+Shift+A"
		settings.save(ignore_version=True)

		out = api.get_settings()
		self.assertTrue(out["enabled"])
		self.assertEqual(out["sidebar_width"], 420)
		self.assertEqual(out["keyboard_shortcut"], "Mod+Shift+A")

	def test_disabled_returns_false_not_truthy_int(self):
		# bool() coercion in the endpoint must produce a real bool — not the
		# `0` int that Frappe stores — so the FE's `enabled: msg.enabled ??
		# false` check works.
		settings = frappe.get_single("AI Assistant Settings")
		settings.enabled = 0
		settings.save(ignore_version=True)
		out = api.get_settings()
		self.assertIs(out["enabled"], False)

	def test_returns_int_for_sidebar_width(self):
		# Doctype default is 380; validation enforces 300–600, so we can't
		# coerce a falsy value into storage to exercise the `or 380` fallback
		# directly. Cover the live path instead — the endpoint must hand
		# back a real int the frontend can use as a width.
		out = api.get_settings()
		self.assertIsInstance(out["sidebar_width"], int)
		self.assertGreaterEqual(out["sidebar_width"], 300)
		self.assertLessEqual(out["sidebar_width"], 600)

	def test_keyboard_shortcut_fallback_matches_doctype_default(self):
		# `Alt+/` must be the runtime fallback (not the reserved `Ctrl+/`).
		settings = frappe.get_single("AI Assistant Settings")
		settings.keyboard_shortcut = ""
		settings.save(ignore_version=True)
		out = api.get_settings()
		self.assertEqual(out["keyboard_shortcut"], "Alt+/")
