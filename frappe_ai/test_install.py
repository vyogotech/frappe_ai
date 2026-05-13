# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""Tests for frappe_ai.install — after_install / after_migrate idempotence."""

import unittest

import frappe

from frappe_ai import install


class TestInstall(unittest.TestCase):
	def test_after_install_creates_settings_singleton(self):
		# The hook may already have run (the singleton exists after app install),
		# but it should be safe to invoke directly.
		install.after_install()
		self.assertTrue(frappe.db.exists("AI Assistant Settings", "AI Assistant Settings"))

	def test_after_migrate_is_idempotent(self):
		# Running the migrate hook repeatedly must not raise or duplicate
		# the singleton (and there can only be one for a Single doctype anyway).
		install.after_migrate()
		install.after_migrate()
		install.after_migrate()
		self.assertTrue(frappe.db.exists("AI Assistant Settings", "AI Assistant Settings"))

	def test_ensure_settings_called_twice_no_op(self):
		# Direct call to the private helper. Second invocation must be a
		# no-op because the early `frappe.db.exists` guard short-circuits.
		# Counting "Single" doctype rows isn't meaningful (they live in
		# tabSingles keyed by fieldname); rely on existence + no-throw.
		install._ensure_settings()
		install._ensure_settings()
		self.assertTrue(frappe.db.exists("AI Assistant Settings", "AI Assistant Settings"))
