"""Realtime broadcast hooks for cross-tab message synchronisation.

BUG-004: a second tab opened on the same conversation never sees messages
posted from the first tab. This module's `broadcast_message_added` hook
fires on every AI Chat Message insert and publishes the new message via
Frappe realtime, scoped to the owning user. Each tab subscribes to
`frappe_ai:msg_added` on mount; the handler in
`composables/useChat.ts` appends the message if it belongs to the
conversation currently shown and the tab isn't already mid-stream.
"""

from __future__ import annotations

from typing import Any

import frappe


def broadcast_message_added(doc: Any, method: str | None = None) -> None:
    """`doc_events` after_insert hook for AI Chat Message.

    Fans the new message out via `frappe.publish_realtime` so any
    sidebar tabs subscribed to ``frappe_ai:msg_added`` can update their
    bubble list without polling. Best-effort: any failure is logged and
    swallowed so the message insert itself is not aborted.
    """
    try:
        user = frappe.db.get_value("AI Chat Session", doc.session, "user")
        if not user:
            return
        # `doc.creation` may be a datetime (in-process insert) or a string
        # (resource-API insert path) depending on the caller; both are
        # serialised through `_to_iso_utc` so the wire format matches what
        # the FE expects (Z-suffixed UTC).
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
    except Exception as exc:
        frappe.log_error(
            title="frappe_ai broadcast_message_added failed",
            message=str(exc),
        )
