import ipaddress
import json
import socket
import uuid
from urllib.parse import urlparse

import frappe
import requests
from frappe import _

# below the agent's own 32 000-char cap because the relay also serialises the message into RQ
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

	Hard rules (always enforced, ADR-005):
	  - Must parse as an absolute http(s) URL with a host that resolves.
	  - Must not target the cloud metadata names (169.254.169.254,
	    fd00:ec2::254, metadata.google.internal) or any link-local address.
	  - A public address must use https, so the sid never crosses the
	    internet in the clear.

	Soft rule (skipped when site_config has `frappe_ai_agent_url_unsafe_ok`):
	  - Every address the host resolves to must be `is_global`. Rejects
	    RFC1918 private (10/8, 172.16/12, 192.168/16), loopback,
	    link-local, multicast, reserved, unspecified, shared (CGNAT), and
	    benchmarking ranges in one check — so an internal-hostname like
	    `internal-svc:8080` cannot exfiltrate the sid.

	The "unsafe_ok" escape hatch exists because local dev legitimately
	targets http://host.docker.internal:NNNN or http://127.0.0.1:NNNN,
	which would otherwise trip the private-network check.
	"""
	parsed = urlparse(url)
	if parsed.scheme not in ("http", "https"):
		frappe.throw(_("AI agent URL must use http or https (got '{0}').").format(parsed.scheme or "(none)"))
	if not parsed.hostname:
		frappe.throw(_("AI agent URL must include a hostname."))

	host = parsed.hostname  # str (guaranteed by the earlier `not parsed.hostname` check)
	assert host is not None  # narrow for the type checker
	# Block the IMDS endpoints used to escalate inside AWS / GCP / Azure.
	# is_global also catches the IPv4 IMDS (link-local), but the explicit
	# match gives operators a clearer error than "non-public address".
	if host in ("169.254.169.254", "fd00:ec2::254", "metadata.google.internal"):
		frappe.throw(_("AI agent URL targets a cloud metadata endpoint, which is not allowed."))

	# every address, not the first: round-robin DNS or AAAA records can mix public and private
	candidate_ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
	try:
		candidate_ips.append(ipaddress.ip_address(host))
	except ValueError:
		# host is a name. Resolve it; a name that does not resolve now could resolve anywhere later.
		try:
			port = parsed.port or (443 if parsed.scheme == "https" else 80)
			infos = socket.getaddrinfo(host, port)
		except socket.gaierror:
			frappe.throw(_("AI agent URL host '{0}' does not resolve.").format(host))
		else:
			for info in infos:
				try:
					candidate_ips.append(ipaddress.ip_address(info[4][0]))
				except (ValueError, IndexError):
					continue

	private_ok = frappe.local.conf.get("frappe_ai_agent_url_unsafe_ok")
	for ip in candidate_ips:
		if ip.is_link_local:
			frappe.throw(
				_("AI agent URL resolves to a link-local address ({0}), which is not allowed.").format(ip)
			)
		if ip.is_global and parsed.scheme != "https":
			frappe.throw(_("AI agent URL must use https for a public address ({0}).").format(ip))
		# is_global, not is_private: is_private is False for shared (CGNAT) 100.64.0.0/10
		if not ip.is_global and not private_ok:
			frappe.throw(
				_(
					"AI agent URL resolves to a non-public address ({0}). "
					"Set frappe_ai_agent_url_unsafe_ok in site_config.json for local development."
				).format(ip)
			)


_CANCEL_KEY_PREFIX = "frappe_ai:cancel:"
# Short TTL: cancellation should propagate within a few seconds. If the worker
# never sees the flag (already done), the key just expires.
_CANCEL_KEY_TTL_SECONDS = 300


def _cancel_key(session_id: str) -> str:
	# the worker runs as the user who enqueued it, so a cancel reaches only that user's own stream
	return f"{_CANCEL_KEY_PREFIX}{frappe.session.user}:{session_id}"


@frappe.whitelist(methods=["POST"])
def cancel_stream(session_id: str) -> dict:
	"""Signal the running worker for ``session_id`` to stop relaying chunks.

	Used by the sidebar's ``cancelMessage`` (e.g. user clicked Stop) and by
	the ``beforeunload`` hook (BUG-003). The worker checks the cache flag
	between agent SSE reads and exits the loop when the flag appears.
	"""
	if not session_id or not session_id.strip():
		return {"ok": False}
	# Use site cache so all worker processes for this site see the flag.
	frappe.cache().set_value(
		_cancel_key(session_id),
		"1",
		expires_in_sec=_CANCEL_KEY_TTL_SECONDS,
	)
	return {"ok": True}


def _is_stream_cancelled(session_id: str) -> bool:
	"""Return True if a cancel was requested for ``session_id``.

	Consumes the flag on read so subsequent turns on the same session start
	fresh — preventing a stale cancel from killing a brand new turn.
	"""
	if not session_id:
		return False
	key = _cancel_key(session_id)
	cache = frappe.cache()
	# the flag is set by another process, so this process's memo of the last miss is stale
	val = cache.get_value(key, use_local_cache=False)
	if val:
		cache.delete_value(key)
		return True
	return False


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
	# the int annotation is what makes v16's @whitelist coerce limit (test_unparseable_limit_raises_frappe_type_error)
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
			"timestamp": _to_iso_utc(r.get("creation")),
		}
		for r in rows
	]
	return {"session_id": session_id, "messages": messages}


def _to_iso_utc(value) -> str | None:
	"""Serialise a Frappe datetime as ISO 8601 with an explicit UTC suffix.

	Frappe writes ``creation`` naively in ``System Settings.time_zone`` (NOT
	the container's OS TZ). ``str(dt)`` therefore returns e.g.
	``"2026-05-16 16:17:20.101924"`` with no tz suffix even when the container
	is UTC. JavaScript's ``new Date(str)`` parses that as LOCAL time, which
	produced BUG-002: fresh-sent bubbles (rendered with ``new Date()``) showed
	a different time than restored bubbles after reload.

	Convert from the configured system tz to UTC, then emit ISO 8601 with
	``Z`` so the FE's ``new Date(ts)`` resolves to the same instant on every
	device and renders in the user's local timezone consistently.
	"""
	import datetime as _dt

	from frappe.utils import get_datetime, get_system_timezone

	if value is None:
		return None

	dt = get_datetime(value) if not isinstance(value, _dt.datetime) else value
	if dt is None:
		return None

	if dt.tzinfo is None:
		# Naive Frappe datetime: localise to the system timezone first.
		try:
			system_tz = get_system_timezone()
			# get_system_timezone returns a string like "Asia/Kolkata".
			# Use zoneinfo for the actual conversion (Python 3.9+).
			from zoneinfo import ZoneInfo

			dt = dt.replace(tzinfo=ZoneInfo(system_tz))
		except Exception:
			# Fallback: assume UTC if anything goes wrong getting the tz.
			dt = dt.replace(tzinfo=_dt.timezone.utc)

	utc_dt = dt.astimezone(_dt.timezone.utc)
	# Replace "+00:00" with "Z" for the canonical UTC suffix the FE expects.
	return utc_dt.isoformat().replace("+00:00", "Z")


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


@frappe.whitelist(methods=["POST"])
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

	# a Stop that landed after the previous answer's last line would otherwise cancel this one
	frappe.cache.delete_value(_cancel_key(session_id))

	timeout_seconds = int(settings.timeout or 30)
	# RQ keeps a job's arguments for days and shows them to System Managers, so the job gets a key to the sid instead
	sid_key = frappe.generate_hash(length=32)
	frappe.cache.set_value(_SID_KEY_PREFIX + sid_key, frappe.session.sid, expires_in_sec=timeout_seconds + 30)

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
		sid_key=sid_key,
		agent_url=agent_url,
		timeout_seconds=timeout_seconds,
		page_context=_sanitize_page_context(page_context),
	)

	return {"session_id": session_id}


_SID_KEY_PREFIX = "frappe_ai:sid:"


def _take_sid(sid_key: str) -> str:
	"""The sid start_stream left for this job; gone after the first read."""
	key = _SID_KEY_PREFIX + sid_key
	try:
		return frappe.cache.get_value(key, use_local_cache=False) or ""
	finally:
		frappe.cache.delete_value(key)


def _stream_to_agent(
	message: str,
	session_id: str,
	user: str,
	sid_key: str,
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
		# AI Chat Session row, and so its FrappeHistoryClient can pull
		# prior messages back into the LLM context for this session.
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
			cookies={"sid": _take_sid(sid_key)},
			headers={
				"Content-Type": "application/json",
				"Accept": "text/event-stream",
			},
			# a down agent fails the connect in seconds, not the whole reply budget
			timeout=(5, timeout_seconds),
			stream=True,
		) as response:
			response.raise_for_status()

			for line in response.iter_lines(decode_unicode=True):
				if _is_stream_cancelled(session_id):
					logger.info(
						"stream.cancelled session=%s after=%dms chunks=%d",
						session_id,
						int((time.monotonic() - stream_start) * 1000),
						chunk_count,
					)
					done_received = True
					done_source = "cancel"
					frappe.publish_realtime(
						event_name,
						{"type": "done", "tools_called": [], "cancelled": True},
						user=user,
						after_commit=False,
					)
					break
				if not line or not line.startswith("data: "):
					continue
				try:
					chunk = json.loads(line[6:])
				except (json.JSONDecodeError, ValueError):
					continue
				if not isinstance(chunk, dict):
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
		frappe.log_error(title="AI Agent Stream Failed", message=frappe.get_traceback())
		frappe.publish_realtime(
			event_name,
			{"type": "error", "message": "Failed to connect to AI agent."},
			user=user,
			after_commit=False,
		)
		done_received = True
		done_source = "error"
	except Exception:
		# the job's own timeout (RQ raises it in here) or a bug: the user still gets an end. Logged here, not re-raised:
		# Frappe's job log records every frame's variables, and this frame holds the user's question
		frappe.log_error(title="AI Agent Stream Failed", message=frappe.get_traceback())
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
