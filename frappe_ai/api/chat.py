import json
import uuid

import frappe
import requests
from frappe import _


def _agent_url() -> str:
	return frappe.local.conf.get("frappe_ai_agent_url", "").rstrip("/")


@frappe.whitelist()
def start_stream(message: str, session_id: str | None = None) -> dict:
	"""Enqueue an agent SSE relay in the background and return the session_id immediately.

	The browser subscribes to frappe_ai:chunk:<session_id> via frappe.realtime.on
	before calling this endpoint. The background worker (queue=long) consumes the
	agent's SSE stream and publishes each chunk via frappe.publish_realtime.
	"""
	if not message:
		frappe.throw(_("Message is required"))

	if len(message) > 10000:
		frappe.throw(_("Message too long (max 10,000 characters)."))

	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Authentication required"), frappe.AuthenticationError)

	settings = frappe.get_single("AI Assistant Settings")
	if not settings.enabled:
		frappe.throw(_("AI Assistant is not enabled"))

	if not session_id:
		session_id = str(uuid.uuid4())

	agent_url = _agent_url()
	if not agent_url:
		frappe.throw(_("AI agent URL is not configured. Set frappe_ai_agent_url in site_config."))

	timeout_seconds = int(settings.timeout or 30)

	frappe.enqueue(
		"frappe_ai.api.chat._stream_to_agent",
		queue="long",
		# Worker timeout is agent timeout + buffer so the worker can emit the error event.
		timeout=timeout_seconds + 30,
		# Enqueue after the HTTP transaction commits so the worker sees all side effects.
		enqueue_after_commit=True,
		message=message,
		session_id=session_id,
		user=user,
		sid=frappe.session.sid,
		agent_url=agent_url,
		timeout_seconds=timeout_seconds,
	)

	return {"session_id": session_id}


def _stream_to_agent(
	message: str,
	session_id: str,
	user: str,
	sid: str,
	agent_url: str,
	timeout_seconds: int = 30,
) -> None:
	"""Background worker: relay agent SSE chunks to the browser via frappe.realtime.

	Not a whitelisted endpoint — only called via frappe.enqueue.
	"""
	payload = {
		"message": message,
		"context": {"user_id": user},
	}

	event_name = f"frappe_ai:chunk:{session_id}"
	done_received = False

	try:
		with requests.post(
			f"{agent_url}/api/v1/chat",
			json=payload,
			cookies={"sid": sid},
			headers={
				"Content-Type": "application/json",
				"Accept": "text/event-stream",
			},
			timeout=timeout_seconds,
			stream=True,
		) as response:
			response.raise_for_status()

			for line in response.iter_lines(decode_unicode=True):
				if not line or not line.startswith("data: "):
					continue
				try:
					chunk = json.loads(line[6:])
				except (json.JSONDecodeError, ValueError):
					continue

				if chunk.get("type") == "done":
					done_received = True

				frappe.publish_realtime(
					event_name,
					chunk,
					user=user,
					after_commit=False,
				)

	except requests.exceptions.Timeout:
		frappe.publish_realtime(
			event_name,
			{"type": "error", "message": "Request timed out. Please try again."},
			user=user,
			after_commit=False,
		)
		done_received = True
	except requests.exceptions.RequestException as e:
		frappe.log_error(title="AI Agent Stream Failed", message=str(e))
		frappe.publish_realtime(
			event_name,
			{"type": "error", "message": "Failed to connect to AI agent."},
			user=user,
			after_commit=False,
		)
		done_received = True

	if not done_received:
		frappe.publish_realtime(
			event_name,
			{"type": "done", "tools_called": []},
			user=user,
			after_commit=False,
		)
