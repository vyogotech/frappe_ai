import json
import uuid

import frappe
import requests
from frappe import _


def _agent_url() -> str:
    return frappe.local.conf.get("frappe_ai_agent_url", "").rstrip("/")


@frappe.whitelist()
def start_stream(message: str, session_id: str | None = None) -> dict:
    """Relay a chat message to the agent via SSE and broadcast chunks via realtime.

    Each SSE chunk is published as frappe.publish_realtime("frappe_ai:chunk:<session_id>", ...)
    The browser subscribes to this event via frappe.realtime.on(...).

    Returns: {"session_id": session_id} so the browser knows which event to listen on.
    """
    if not message:
        frappe.throw(_("Message is required"))

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

    payload = {
        "message": message,
        "context": {
            "user_id": user,
        },
    }

    try:
        with requests.post(
            f"{agent_url}/api/v1/chat",
            json=payload,
            cookies={"sid": frappe.session.sid},
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            timeout=settings.timeout or 30,
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

                frappe.publish_realtime(
                    f"frappe_ai:chunk:{session_id}",
                    chunk,
                    user=user,
                    after_commit=False,
                )

    except requests.exceptions.Timeout:
        frappe.publish_realtime(
            f"frappe_ai:chunk:{session_id}",
            {"type": "error", "message": "Request timed out. Please try again."},
            user=user,
            after_commit=False,
        )
    except requests.exceptions.RequestException as e:
        frappe.log_error(title="AI Agent Stream Failed", message=str(e))
        frappe.publish_realtime(
            f"frappe_ai:chunk:{session_id}",
            {"type": "error", "message": "Failed to connect to AI agent."},
            user=user,
            after_commit=False,
        )

    return {"session_id": session_id}
