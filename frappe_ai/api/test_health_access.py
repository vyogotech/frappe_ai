"""Only a System Manager may run the Settings page's Test Connection: it makes an outbound call on request."""

import frappe
from frappe.tests import IntegrationTestCase

from frappe_ai.api import health

USER = "health_check_user@example.com"


class TestTestConnectionIsForSystemManagers(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("User", USER):
			user = {"doctype": "User", "email": USER, "first_name": "Health", "send_welcome_email": 0}
			frappe.get_doc(user | {"roles": [{"role": "All"}]}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_a_user_without_system_manager_is_refused(self):
		frappe.set_user(USER)
		with self.assertRaises(frappe.PermissionError):
			health.test_connection()
