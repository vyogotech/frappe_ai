"""
AI Query API — sid cookie authentication forwarded to the AI agent.
"""

import json
from datetime import datetime

import frappe
import requests
from frappe import _


def _agent_url() -> str:
	return frappe.local.conf.get("frappe_ai_agent_url", "").rstrip("/")


@frappe.whitelist()
def query(message):
	# Deprecated: use frappe_ai.api.chat.start_stream (socketio relay) instead.
	# Retained for backward compatibility; will be removed after Phase 7 verification.
	"""
	Send a message to the AI agent using the user's sid cookie.

	Args:
	    message (str): The query/message to send to the AI assistant

	Returns:
	    dict: Aggregated response from the agent containing AI-generated answer
	"""
	if not message:
		frappe.throw(_("Message is required"))

	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Authentication required"))

	user_email = frappe.db.get_value("User", user, "email")
	settings = frappe.get_single("AI Assistant Settings")

	if not settings.enabled:
		frappe.throw(_("AI Assistant is not enabled"))

	sid = frappe.session.sid

	payload = {
		"message": message,
		"context": {
			"user_id": user,
			"user_email": user_email,
			"timestamp": datetime.now().isoformat(),
		},
	}

	# Fallback: consumes SSE stream server-side and returns aggregated JSON.
	# Phase 6 replaces this with a socketio relay where the browser streams directly.
	try:
		with requests.post(
			f"{_agent_url()}/api/v1/chat",
			json=payload,
			cookies={"sid": sid},
			headers={
				"Content-Type": "application/json",
				"Accept": "text/event-stream",
			},
			timeout=settings.timeout or 30,
			stream=True,
		) as response:
			response.raise_for_status()

			content_parts: list[str] = []
			tools_called: list[str] = []
			agent_error: str | None = None

			for line in response.iter_lines(decode_unicode=True):
				if not line or not line.startswith("data: "):
					continue
				try:
					ev = json.loads(line[6:])
				except (json.JSONDecodeError, ValueError):
					continue
				ev_type = ev.get("type")
				if ev_type == "content":
					text = ev.get("text") or ""
					if text:
						content_parts.append(text)
				elif ev_type == "done":
					tools_called = ev.get("tools_called") or []
				elif ev_type == "error":
					# Capture but keep draining — the agent always emits
					# `done` after `error`, and we want to consume the
					# stream cleanly to free the connection.
					agent_error = ev.get("message") or "Agent error"

		if agent_error:
			frappe.throw(_(agent_error))

		return {
			"response": "".join(content_parts),
			"tool_calls": [{"name": t} for t in tools_called],
		}

	except requests.exceptions.Timeout:
		frappe.log_error(
			title="AI Agent Query Timeout",
			message=f"Query timed out after {settings.timeout or 30}s: {message}",
		)
		frappe.throw(_("Request timed out. Please try again."))

	except requests.exceptions.RequestException as e:
		frappe.log_error(
			title="AI Agent Query Failed",
			message=f"Query failed: {e}\nMessage: {message}",
		)
		frappe.throw(_("Failed to query AI assistant. Please check the logs."))


@frappe.whitelist()
def test_connection():
	"""Test connectivity to the AI agent using sid cookie authentication."""
	settings = frappe.get_single("AI Assistant Settings")

	if not settings.enabled:
		return {"success": False, "message": "AI Assistant is not enabled"}

	if frappe.session.user == "Guest":
		return {"success": False, "message": "Please log in to test the connection"}

	try:
		sid = frappe.session.sid
		agent_url = _agent_url()

		health_response = requests.get(
			f"{agent_url}/health",
			cookies={"sid": sid},
			timeout=10,
		)

		if health_response.status_code != 200:
			return {
				"success": False,
				"message": f"AI agent health check failed (status {health_response.status_code})",
			}

		health_data = health_response.json() if health_response.text else {}

		test_query = {
			"message": "test connection",
			"context": {
				"user_id": frappe.session.user,
				"timestamp": datetime.now().isoformat(),
			},
		}

		query_response = requests.post(
			f"{agent_url}/api/v1/chat",
			json=test_query,
			cookies={"sid": sid},
			headers={"Content-Type": "application/json"},
			timeout=settings.timeout or 30,
		)

		if query_response.status_code == 200:
			return {
				"success": True,
				"message": "Successfully connected to AI agent",
				"details": {
					"health": health_data,
					"auth_method": "sid cookie",
					"user": frappe.session.user,
				},
			}
		else:
			return {
				"success": False,
				"message": f"Health OK but query test failed (status {query_response.status_code})",
				"details": {
					"health": health_data,
					"error": query_response.text[:200] if query_response.text else "",
				},
			}

	except requests.exceptions.Timeout:
		return {
			"success": False,
			"message": "Connection timeout. Check if the AI agent is running.",
		}

	except requests.exceptions.ConnectionError as e:
		return {
			"success": False,
			"message": f"Cannot connect to AI agent: {e}",
		}

	except Exception as e:
		frappe.log_error(
			title="AI Agent Connection Test Failed",
			message=f"Error testing connection to AI agent: {e}",
		)
		return {"success": False, "message": f"Connection test failed: {e}"}
