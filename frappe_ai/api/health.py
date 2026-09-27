"""Health check for the AI agent, called from the Settings page's Test Connection button."""

import frappe
import requests
from frappe import _

from frappe_ai.api.chat import _request_id, _validate_agent_url


def _agent_url() -> str:
	return frappe.local.conf.get("frappe_ai_agent_url", "").rstrip("/")


@frappe.whitelist()
def test_connection():
	"""Test connectivity to the AI agent by calling its /health endpoint."""
	frappe.only_for("System Manager")
	settings = frappe.get_single("AI Assistant Settings")

	if not settings.enabled:
		return {"success": False, "message": _("AI Assistant is not enabled")}

	try:
		agent_url = _agent_url()
		if not agent_url:
			return {"success": False, "message": _("AI agent URL is not configured.")}
		try:
			_validate_agent_url(agent_url)
		except frappe.ValidationError as e:
			# Surface the validation message rather than 500-ing; the
			# settings page caller renders the message verbatim.
			return {"success": False, "message": str(e)}

		# the other call this app makes to the agent, under the same header (ADR-008)
		headers = {"X-Request-ID": _request_id()}
		health_response = requests.get(f"{agent_url}/health", headers=headers, timeout=10)

		if health_response.status_code == 200:
			return {
				"success": True,
				"message": _("Successfully connected to AI agent"),
				"details": {
					"health": health_response.json() if health_response.text else {},
					"user": frappe.session.user,
				},
			}

		return {
			"success": False,
			"message": _("AI agent health check failed (HTTP {0})").format(health_response.status_code),
		}

	except requests.exceptions.Timeout:
		return {"success": False, "message": _("Connection timeout. Check if the AI agent is running.")}

	except requests.exceptions.ConnectionError as e:
		return {"success": False, "message": _("Cannot connect to AI agent: {0}").format(e)}

	# not Exception: a bug must not read as unreachable. ValueError: .json(), and getaddrinfo's UnicodeError
	except (requests.RequestException, ValueError) as e:
		frappe.log_error(
			title="AI Agent Connection Test Failed",
			message=f"rid={_request_id()}\n{frappe.get_traceback()}",
		)
		return {"success": False, "message": _("Connection test failed: {0}").format(e)}
