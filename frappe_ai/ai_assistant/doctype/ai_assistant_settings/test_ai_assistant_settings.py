# Copyright (c) 2024, Frappe and Contributors
# See license.txt

import unittest

import frappe


class TestAIAssistantSettings(unittest.TestCase):
	def setUp(self):
		self.settings = frappe.get_single("AI Assistant Settings")
		self._original_timeout = self.settings.timeout
		self._original_sidebar_width = self.settings.sidebar_width

	def tearDown(self):
		self.settings.timeout = self._original_timeout
		self.settings.sidebar_width = self._original_sidebar_width
		self.settings.save(ignore_version=True)

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
		self.settings.timeout = 0
		with self.assertRaises(frappe.ValidationError):
			self.settings.save()

		self.settings.timeout = 400
		with self.assertRaises(frappe.ValidationError):
			self.settings.save()

		self.settings.timeout = 30
		self.settings.save()
		self.assertEqual(self.settings.timeout, 30)

	def test_sidebar_width_validation(self):
		self.settings.sidebar_width = 100
		with self.assertRaises(frappe.ValidationError):
			self.settings.save()

		self.settings.sidebar_width = 700
		with self.assertRaises(frappe.ValidationError):
			self.settings.save()

		self.settings.sidebar_width = 380
		self.settings.save()
		self.assertEqual(self.settings.sidebar_width, 380)
