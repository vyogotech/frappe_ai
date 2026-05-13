# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import unittest

import frappe


def _reload_settings():
	"""Fetch a fresh copy of the singleton.

	Each call to `doc.save()` bumps `modified` on the in-memory document,
	and Frappe v16's `check_if_latest()` then refuses subsequent saves
	with TimestampMismatchError. Reloading between saves is the cheapest
	way to keep these unit tests deterministic without disabling the
	version check.
	"""
	return frappe.get_single("AI Assistant Settings")


class TestAIAssistantSettings(unittest.TestCase):
	def setUp(self):
		self.settings = _reload_settings()
		self._original_timeout = self.settings.timeout
		self._original_sidebar_width = self.settings.sidebar_width

	def tearDown(self):
		settings = _reload_settings()
		settings.timeout = self._original_timeout
		settings.sidebar_width = self._original_sidebar_width
		settings.save(ignore_version=True)

	def test_url_trailing_slash_is_stripped(self):
		# agent_url is read from site_config in before_save — mock it here.
		original = frappe.local.conf.get("frappe_ai_agent_url")
		frappe.local.conf["frappe_ai_agent_url"] = "http://localhost:8484/"
		try:
			self.settings.save()
			self.assertEqual(self.settings.agent_url, "http://localhost:8484")
		finally:
			if original is None:
				frappe.local.conf.pop("frappe_ai_agent_url", None)
			else:
				frappe.local.conf["frappe_ai_agent_url"] = original

	def test_timeout_validation(self):
		settings = _reload_settings()
		settings.timeout = 0
		with self.assertRaises(frappe.ValidationError):
			settings.save()

		settings = _reload_settings()
		settings.timeout = 400
		with self.assertRaises(frappe.ValidationError):
			settings.save()

		settings = _reload_settings()
		settings.timeout = 30
		settings.save()
		self.assertEqual(settings.timeout, 30)

	def test_sidebar_width_validation(self):
		settings = _reload_settings()
		settings.sidebar_width = 100
		with self.assertRaises(frappe.ValidationError):
			settings.save()

		settings = _reload_settings()
		settings.sidebar_width = 700
		with self.assertRaises(frappe.ValidationError):
			settings.save()

		settings = _reload_settings()
		settings.sidebar_width = 380
		settings.save()
		self.assertEqual(settings.sidebar_width, 380)

	# ── keyboard shortcut validator (the most complex on this doctype) ──

	def _save_with_shortcut(self, shortcut):
		settings = _reload_settings()
		settings.keyboard_shortcut = shortcut
		settings.save()
		return settings

	def test_shortcut_accepts_alt_slash(self):
		# Default value — must round-trip.
		self.assertEqual(self._save_with_shortcut("Alt+/").keyboard_shortcut, "Alt+/")

	def test_shortcut_accepts_mod_shift_letter(self):
		self.assertEqual(self._save_with_shortcut("Mod+Shift+A").keyboard_shortcut, "Mod+Shift+A")

	def test_shortcut_accepts_alt_semicolon(self):
		self.assertEqual(self._save_with_shortcut("Alt+;").keyboard_shortcut, "Alt+;")

	def test_shortcut_accepts_case_insensitively(self):
		# Validator regex is case-insensitive; the stored value preserves case.
		self.assertEqual(self._save_with_shortcut("alt+/").keyboard_shortcut, "alt+/")

	def test_shortcut_rejects_no_modifier(self):
		with self.assertRaises(frappe.ValidationError):
			self._save_with_shortcut("/")

	def test_shortcut_rejects_garbage(self):
		with self.assertRaises(frappe.ValidationError):
			self._save_with_shortcut("not a shortcut")

	def test_shortcut_rejects_empty_modifier_chain(self):
		with self.assertRaises(frappe.ValidationError):
			self._save_with_shortcut("Ctrl+")

	def test_shortcut_rejects_each_reserved_combo(self):
		# These are the Frappe v16 hard-bound combos that `_validate_shortcut`
		# explicitly refuses. Pinning them in a test means we'll notice if
		# someone widens the regex without auditing the reserved set.
		reserved = [
			"Ctrl+/",
			"Ctrl+K",
			"Ctrl+G",
			"Ctrl+S",
			"Alt+S",
			"Shift+/",
		]
		for combo in reserved:
			with self.subTest(combo=combo):
				with self.assertRaises(frappe.ValidationError):
					self._save_with_shortcut(combo)

	def test_shortcut_blank_is_allowed(self):
		# Empty shortcut means "no keyboard toggle wired" — must not raise.
		self._save_with_shortcut("")
