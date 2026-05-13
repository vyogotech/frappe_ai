"""Health check for the AI agent, called from the Settings page's Test Connection button."""

import frappe
import requests
from frappe import _

from frappe_ai.api.chat import _validate_agent_url


def _agent_url() -> str:
	return frappe.local.conf.get("frappe_ai_agent_url", "").rstrip("/")


@frappe.whitelist()
def test_connection():
	"""Test connectivity to the AI agent by calling its /health endpoint."""
	settings = frappe.get_single("AI Assistant Settings")

	if not settings.enabled:
		return {"success": False, "message": "AI Assistant is not enabled"}

	if frappe.session.user == "Guest":
		frappe.throw(_("Authentication required"), frappe.AuthenticationError)

	try:
		agent_url = _agent_url()
		if not agent_url:
			return {"success": False, "message": "AI agent URL is not configured."}
		try:
			_validate_agent_url(agent_url)
		except frappe.ValidationError as e:
			# Surface the validation message rather than 500-ing; the
			# settings page caller renders the message verbatim.
			return {"success": False, "message": str(e)}

		health_response = requests.get(
			f"{agent_url}/health",
			cookies={"sid": frappe.session.sid},
			timeout=10,
		)

		if health_response.status_code == 200:
			return {
				"success": True,
				"message": "Successfully connected to AI agent",
				"details": {
					"health": health_response.json() if health_response.text else {},
					"user": frappe.session.user,
				},
			}

		return {
			"success": False,
			"message": f"AI agent health check failed (HTTP {health_response.status_code})",
		}

	except requests.exceptions.Timeout:
		return {"success": False, "message": "Connection timeout. Check if the AI agent is running."}

	except requests.exceptions.ConnectionError as e:
		return {"success": False, "message": f"Cannot connect to AI agent: {e}"}

	except Exception as e:
		frappe.log_error(title="AI Agent Connection Test Failed", message=str(e))
		return {"success": False, "message": f"Connection test failed: {e}"}
