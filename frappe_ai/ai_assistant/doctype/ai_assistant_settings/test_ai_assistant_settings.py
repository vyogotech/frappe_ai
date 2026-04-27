# Copyright (c) 2024, Frappe and Contributors
# See license.txt

import unittest

import frappe


class TestAIAssistantSettings(unittest.TestCase):
	def setUp(self):
		self.settings = frappe.get_single("AI Assistant Settings")

	def test_url_trailing_slash_is_stripped(self):
		self.settings.agent_url = "http://localhost:8484/"
		self.settings.save()
		self.assertEqual(self.settings.agent_url, "http://localhost:8484")

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
