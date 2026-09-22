"""Cross-tab sync: each new AI Chat Message is published to its owner's other open tabs."""

from __future__ import annotations

from typing import Any

import frappe


def broadcast_message_added(doc: Any, method: str | None = None) -> None:
	"""Publish frappe_ai:msg_added to the chat's owner; it logs and swallows errors so the insert stands."""
	try:
		user = frappe.db.get_value("AI Chat Session", doc.session, "user")
		if not user:
			return
		# creation is a datetime from an in-process insert but a string from the REST API; _to_iso_utc takes both
		from frappe_ai.api.chat import _to_iso_utc

		payload = {
			"session_id": doc.session,
			"id": doc.name,
			"role": doc.role,
			"content": doc.content or "",
			"timestamp": _to_iso_utc(getattr(doc, "creation", None)),
		}
		# after_commit=False so the publish happens immediately rather than
		# being queued on the request's commit hook list.
		frappe.publish_realtime(
			"frappe_ai:msg_added",
			payload,
			user=user,
			after_commit=False,
		)
	except Exception:  # noqa: BLE001 - runs in the message's after_insert hook, so anything raised loses the saved message
		frappe.log_error(
			title="frappe_ai broadcast_message_added failed",
			message=frappe.get_traceback(),
		)
