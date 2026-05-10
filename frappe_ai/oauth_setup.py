"""
OAuth2 client setup utilities for Frappe AI.

These are manual helpers — run from bench console, not called automatically.
The after_install hook is in install.py.
"""

import frappe


def create_oauth_client():
	"""Create an OAuth2 client for the AI agent to authenticate against Frappe.

	Usage:
	    bench --site your-site execute frappe_ai.oauth_setup.create_oauth_client
	"""
	if frappe.db.exists("OAuth Client", {"app_name": "Frappe AI Agent"}):
		existing = frappe.get_doc("OAuth Client", {"app_name": "Frappe AI Agent"})
		print(f"OAuth Client already exists. Client ID: {existing.client_id}")
		return existing

	oauth_client = frappe.get_doc(
		{
			"doctype": "OAuth Client",
			"app_name": "Frappe AI Agent",
			"grant_type": "Client Credentials",
			"response_type": "Token",
			"scopes": "openid profile email all",
		}
	)

	oauth_client.insert(ignore_permissions=True)
	frappe.db.commit()

	print("=" * 60)
	print("OAuth Client created successfully!")
	print(f"Client ID:     {oauth_client.client_id}")
	print(f"Client Secret: {oauth_client.client_secret}")
	print("Add these to your AI agent config under oauth2.trusted_clients.")
	print("=" * 60)

	return oauth_client
