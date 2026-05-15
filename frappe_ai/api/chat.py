import ipaddress
import json
import uuid
from urllib.parse import urlparse

import frappe
import requests
from frappe import _

# Upper bound on the user's single-message payload. Mirrors the agent's
# own 32 000-char Pydantic cap with a stricter ceiling because the relay
# also has to serialise this to RQ. Settable per-site via
# `frappe_ai_message_max_chars` in site_config.json.
_DEFAULT_MESSAGE_MAX_CHARS = 10_000


def _agent_url() -> str:
	return frappe.local.conf.get("frappe_ai_agent_url", "").rstrip("/")


def _message_max_chars() -> int:
	raw = frappe.local.conf.get("frappe_ai_message_max_chars")
	if raw is None:
		return _DEFAULT_MESSAGE_MAX_CHARS
	try:
		v = int(raw)
		return v if v > 0 else _DEFAULT_MESSAGE_MAX_CHARS
	except (TypeError, ValueError):
		return _DEFAULT_MESSAGE_MAX_CHARS


def _validate_agent_url(url: str) -> None:
	"""Refuse agent URLs that look misconfigured or unsafe.

	The worker forwards the user's `sid` cookie to whatever this URL
	resolves to, so an operator typo pointing at the cloud metadata
	endpoint or an internal loopback service would leak the session.

	Hard rules (always enforced):
	  - Must parse as an absolute http(s) URL with a host.

	Soft rules (skipped when site_config has `frappe_ai_agent_url_unsafe_ok`):
	  - Must not target the cloud metadata IPs (169.254.169.254, fd00:ec2::254).
	  - Must not resolve to an unspecified address (0.0.0.0 / ::).

	The "unsafe_ok" escape hatch exists because local dev legitimately
	targets http://host.docker.internal:NNNN or http://127.0.0.1:NNNN,
	which would otherwise trip the private-network check.
	"""
	parsed = urlparse(url)
	if parsed.scheme not in ("http", "https"):
		frappe.throw(_("AI agent URL must use http or https (got '{0}').").format(parsed.scheme or "(none)"))
	if not parsed.hostname:
		frappe.throw(_("AI agent URL must include a hostname."))

	if frappe.local.conf.get("frappe_ai_agent_url_unsafe_ok"):
		return

	host = parsed.hostname  # str (guaranteed by the earlier `not parsed.hostname` check)
	assert host is not None  # narrow for the type checker
	# Block the IMDS endpoints used to escalate inside AWS / GCP / Azure.
	# These are documented constants, not arbitrary private-range guesses.
	if host in ("169.254.169.254", "fd00:ec2::254", "metadata.google.internal"):
		frappe.throw(_("AI agent URL targets a cloud metadata endpoint, which is not allowed."))

	# Reject unspecified addresses (0.0.0.0 / ::) — they bind everything.
	try:
		ip = ipaddress.ip_address(host)
		if ip.is_unspecified:
			frappe.throw(_("AI agent URL must not target an unspecified address ({0}).").format(host))
	except ValueError:
		# host is a name, not an IP literal — DNS will resolve at request time.
		pass


@frappe.whitelist()
def get_recent_messages(limit: int = 50) -> dict:
	"""Return the caller's most recent AI Chat Session and its messages.

	Powers the sidebar's restore-on-mount: the user reopens the desk, the
	sidebar hydrates from this endpoint so the conversation history isn't
	thrown away each page-load.

	Returns {"session_id": str | None, "messages": [{role, content, timestamp}]}.
	An empty session_id with empty messages means the user has no prior
	conversation — the sidebar renders the empty state.
	"""
	user = frappe.session.user
	if user == "Guest":
		return {"session_id": None, "messages": []}

	sessions = frappe.get_all(
		"AI Chat Session",
		filters={"user": user},
		fields=["name"],
		order_by="modified desc",
		limit=1,
	)
	if not sessions:
		return {"session_id": None, "messages": []}

	session_id = sessions[0]["name"]
	# Frappe v16's @whitelist wrapper coerces query-string args to the
	# declared type before the endpoint runs (pydantic-backed), so `limit`
	# arrives as a real int. Unparseable input is rejected upstream with
	# FrappeTypeError — see test_unparseable_limit_raises_frappe_type_error.
	safe_limit = max(1, min(limit, 200))

	rows = frappe.get_all(
		"AI Chat Message",
		filters={"session": session_id},
		fields=["name", "role", "content", "creation"],
		order_by="creation asc",
		limit=safe_limit,
	)
	messages = [
		{
			"id": r["name"],
			"role": r["role"],
			"content": r["content"] or "",
			# RFC3339-ish so the FE can parse with new Date(...)
			"timestamp": str(r["creation"]) if r.get("creation") else None,
		}
		for r in rows
	]
	return {"session_id": session_id, "messages": messages}


_ALLOWED_PAGE_CONTEXT_KEYS = ("route", "doctype", "docname", "currency")


def _sanitize_page_context(raw) -> dict:
	"""Accept only a flat dict of expected page-context fields with string values.

	frappe.whitelist serialises JSON args, so `page_context` may arrive as a
	dict or as a JSON string. Anything else (lists, nested dicts, non-strings)
	gets dropped so a malformed frontend can't bloat the agent payload or
	smuggle non-grounding data into the system prompt.
	"""
	if isinstance(raw, str):
		try:
			raw = json.loads(raw)
		except (json.JSONDecodeError, ValueError):
			return {}
	if not isinstance(raw, dict):
		return {}
	out: dict = {}
	for key in _ALLOWED_PAGE_CONTEXT_KEYS:
		val = raw.get(key)
		if isinstance(val, str) and val:
			# Cap at 200 chars so a giant route can't blow the prompt.
			out[key] = val[:200]
	return out


@frappe.whitelist()
def start_stream(message: str, session_id: str | None = None, page_context=None) -> dict:
	"""Enqueue an agent SSE relay in the background and return the session_id immediately.

	The browser subscribes to frappe_ai:chunk:<session_id> via frappe.realtime.on
	before calling this endpoint. The background worker (queue=long) consumes the
	agent's SSE stream and publishes each chunk via frappe.publish_realtime.

	`page_context` (optional) is a dict {route, doctype, docname, currency}
	captured from the browser; forwarded into the agent's context so the
	system prompt can ground answers in the user's current page.
	"""
	if not message or not message.strip():
		frappe.throw(_("Message is required"))

	max_chars = _message_max_chars()
	if len(message) > max_chars:
		frappe.throw(_("Message too long (max {0} characters).").format(max_chars))

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
	_validate_agent_url(agent_url)

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
		page_context=_sanitize_page_context(page_context),
	)

	return {"session_id": session_id}


def _stream_to_agent(
	message: str,
	session_id: str,
	user: str,
	sid: str,
	agent_url: str,
	timeout_seconds: int = 30,
	page_context: dict | None = None,
) -> None:
	"""Background worker: relay agent SSE chunks to the browser via frappe.realtime.

	Not a whitelisted endpoint — only called via frappe.enqueue.
	"""
	import time

	logger = frappe.logger("frappe_ai", allow_site=True)
	context: dict = {"user_id": user}
	if page_context:
		# Merge the sanitised page context (route/doctype/docname/currency) into
		# the agent's request context. build_system_prompt() reads these keys.
		context.update(page_context)

	payload = {
		"message": message,
		# Forward session_id so the agent groups all turns under the same
		# AI Chat Session row (used for sidebar scrollback). The agent
		# itself does not yet replay prior turns into the LLM context.
		"session_id": session_id,
		"context": context,
	}

	event_name = f"frappe_ai:chunk:{session_id}"
	done_received = False
	chunk_count = 0
	stream_start = time.monotonic()
	done_source = "fallback"  # set to "agent" when the agent emits the done chunk

	logger.info(
		"stream.start session=%s user=%s agent=%s timeout=%ds context_keys=%s msg_len=%d",
		session_id,
		user,
		agent_url,
		timeout_seconds,
		sorted(page_context or {}),
		len(message),
	)

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

				chunk_count += 1
				if chunk.get("type") == "done":
					done_received = True
					done_source = "agent"

				frappe.publish_realtime(
					event_name,
					chunk,
					user=user,
					after_commit=False,
				)

	except requests.exceptions.Timeout:
		logger.warning(
			"stream.timeout session=%s after=%dms chunks=%d",
			session_id,
			int((time.monotonic() - stream_start) * 1000),
			chunk_count,
		)
		frappe.publish_realtime(
			event_name,
			{"type": "error", "message": "Request timed out. Please try again."},
			user=user,
			after_commit=False,
		)
		done_received = True
		done_source = "timeout"
	except requests.exceptions.RequestException as e:
		logger.error(
			"stream.failed session=%s after=%dms chunks=%d err=%s",
			session_id,
			int((time.monotonic() - stream_start) * 1000),
			chunk_count,
			e,
		)
		frappe.log_error(title="AI Agent Stream Failed", message=str(e))
		frappe.publish_realtime(
			event_name,
			{"type": "error", "message": "Failed to connect to AI agent."},
			user=user,
			after_commit=False,
		)
		done_received = True
		done_source = "error"

	if not done_received:
		frappe.publish_realtime(
			event_name,
			{"type": "done", "tools_called": []},
			user=user,
			after_commit=False,
		)

	logger.info(
		"stream.done session=%s user=%s duration_ms=%d chunks=%d done_source=%s",
		session_id,
		user,
		int((time.monotonic() - stream_start) * 1000),
		chunk_count,
		done_source,
	)
