"""
Setup utilities for Frappe AI
"""

import frappe
from frappe import _


def create_oauth_client():
	"""
	Create OAuth2 client for MCP server integration
	This can be run from bench console
	"""
	if frappe.db.exists("OAuth Client", {"app_name": "MCP Backend Integration"}):
		print("OAuth Client already exists")
		existing = frappe.get_doc("OAuth Client", {"app_name": "MCP Backend Integration"})
		print(f"Client ID: {existing.client_id}")
		return existing

	# Create new OAuth client
	oauth_client = frappe.get_doc(
		{
			"doctype": "OAuth Client",
			"app_name": "MCP Backend Integration",
			"scopes": [{"scope": "openid"}, {"scope": "profile"}, {"scope": "email"}, {"scope": "all"}],
			"grant_type": "Client Credentials",
			"response_type": "Code",
		}
	)

	oauth_client.insert(ignore_permissions=True)
	frappe.db.commit()

	print("=" * 60)
	print("OAuth Client created successfully!")
	print("=" * 60)
	print(f"App Name: {oauth_client.app_name}")
	print(f"Client ID: {oauth_client.client_id}")
	print(f"Client Secret: {oauth_client.client_secret}")
	print("=" * 60)
	print("Please save these credentials in AI Assistant Settings")
	print("=" * 60)

	return oauth_client


def after_install():
	"""
	Called after app installation
	"""
	print("=" * 60)
	print("Frappe AI installed successfully!")
	print("=" * 60)
	print("Next steps:")
	print("1. Create OAuth Client: bench --site your-site execute frappe_ai.setup.create_oauth_client")
	print("2. Configure AI Assistant Settings at /app/ai-assistant-settings")
	print("3. Test the integration using Awesome Bar")
	print("=" * 60)
