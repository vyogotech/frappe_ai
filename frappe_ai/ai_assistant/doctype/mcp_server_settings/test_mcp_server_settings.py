# Copyright (c) 2024, Frappe and Contributors
# See license.txt

import frappe
import unittest


class TestMCPServerSettings(unittest.TestCase):
	"""Test cases for MCP Server Settings"""
	
	def setUp(self):
		"""Set up test data"""
		if not frappe.db.exists("MCP Server Settings"):
			doc = frappe.get_doc({
				"doctype": "MCP Server Settings",
				"enabled": 1,
				"mcp_server_url": "http://localhost:8080",
				"frappe_base_url": "http://localhost:8000",
				"oauth_client_id": "test-client",
				"oauth_client_secret": "test-secret",
				"timeout": 30
			})
			doc.insert()
	
	def test_url_validation(self):
		"""Test that URLs are properly formatted"""
		settings = frappe.get_single("MCP Server Settings")
		settings.mcp_server_url = "http://localhost:8080/"
		settings.frappe_base_url = "http://localhost:8000/"
		settings.save()
		
		# URLs should have trailing slashes removed
		self.assertEqual(settings.mcp_server_url, "http://localhost:8080")
		self.assertEqual(settings.frappe_base_url, "http://localhost:8000")
	
	def test_timeout_validation(self):
		"""Test timeout validation"""
		settings = frappe.get_single("MCP Server Settings")
		
		# Test minimum timeout
		settings.timeout = 0
		with self.assertRaises(frappe.ValidationError):
			settings.save()
		
		# Test maximum timeout
		settings.timeout = 400
		with self.assertRaises(frappe.ValidationError):
			settings.save()
		
		# Test valid timeout
		settings.timeout = 30
		settings.save()
		self.assertEqual(settings.timeout, 30)

