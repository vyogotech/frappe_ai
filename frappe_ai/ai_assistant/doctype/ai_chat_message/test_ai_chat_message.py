# Copyright (c) 2026, Vyogo and contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase


class TestAIChatMessage(IntegrationTestCase):
    """Regression tests for AI Chat Message — tenant-isolation column gap (BUG-018)."""

    def setUp(self):
        email = "tenant_test_user@example.com"
        if not frappe.db.exists("User", email):
            frappe.get_doc({
                "doctype": "User",
                "email": email,
                "first_name": "Tenant",
                "last_name": "Test",
                "send_welcome_email": 0,
                "roles": [{"role": "All"}],
            }).insert(ignore_permissions=True)
        self.user = email
        self.addCleanup(frappe.set_user, "Administrator")

    def test_non_admin_can_list_chat_messages_without_sql_error(self):
        frappe.set_user(self.user)
        # Should not raise — was MySQLdb.OperationalError before BUG-018 fix.
        frappe.get_list("AI Chat Message", limit=1)

    def test_doctype_has_tenant_id_column(self):
        self.assertTrue(
            frappe.db.has_column("AI Chat Message", "tenant_id"),
            "AI Chat Message must have a tenant_id column for tenant-isolation queries to work",
        )
