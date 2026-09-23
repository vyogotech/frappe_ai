import ipaddress
import json
import socket
import uuid
from urllib.parse import urlparse

import frappe
import requests
from frappe import _
from frappe.rate_limiter import rate_limit

# below the agent's own 32 000-char cap because the relay also serialises the message into RQ
_DEFAULT_MESSAGE_MAX_CHARS = 10_000

# one relay job per user, named so a second tab, the other frontend or a direct call can be refused
_STREAM_JOB_PREFIX = "frappe_ai:stream:"
# ponytail: a worker killed outright leaves its claim until this expires; every other ending releases it
_STREAM_CLAIM_MARGIN_SECONDS = 60
# a refused start is cheap; an accepted one holds the long worker for the agent's budget plus 30 s
_STARTS_PER_MINUTE = 30


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
	"""Throw unless url is safe to receive the user's sid, which the worker sends to it as a cookie.

	Raises:
		frappe.ValidationError: not http(s), no host or one that does not resolve, a cloud metadata or
			link-local address, http to a public address, or a non-public address without
			frappe_ai_agent_url_unsafe_ok in site_config.
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


def _check_agent_url(url: str) -> None:
	"""Throw unless url is set and safe; only a System Manager is told which address or setting is wrong."""
	try:
		if not url:
			frappe.throw(_("AI agent URL is not configured. Set frappe_ai_agent_url in site_config."))
		_validate_agent_url(url)
	except frappe.ValidationError:
		if "System Manager" in frappe.get_roles():
			raise
		# the resolved address and the site_config key names would otherwise be rendered in the chat bubble
		frappe.clear_last_message()
	else:
		return
	frappe.throw(_("The AI assistant is not set up yet. Contact your administrator."))


_CANCEL_KEY_PREFIX = "frappe_ai:cancel:"
# Short TTL: cancellation should propagate within a few seconds. If the worker
# never sees the flag (already done), the key just expires.
_CANCEL_KEY_TTL_SECONDS = 300


def _cancel_key(session_id: str) -> str:
	# the worker runs as the user who enqueued it, so a cancel reaches only that user's own stream
	return f"{_CANCEL_KEY_PREFIX}{frappe.session.user}:{session_id}"


@frappe.whitelist(methods=["POST"])
def cancel_stream(session_id: str) -> dict:
	"""Flag the caller's relay for session_id to stop; the worker checks it between the agent's SSE lines."""
	if not session_id or not session_id.strip():
		return {"ok": False}
	# Use site cache so all worker processes for this site see the flag.
	frappe.cache().set_value(
		_cancel_key(session_id),
		"1",
		expires_in_sec=_CANCEL_KEY_TTL_SECONDS,
	)
	return {"ok": True}


def _claim_key(user: str) -> bytes:
	return frappe.cache().make_key(_STREAM_JOB_PREFIX + user)


def _claim_the_answer(user: str, ttl: int) -> bool:
	"""True if this user had no answer running: the claim is one redis SET NX, so two tabs cannot both win it."""
	# the job reaches RQ only after this request commits, so RQ cannot be asked whether the slot is free
	return bool(frappe.cache().set(_claim_key(user), b"1", ex=ttl, nx=True))


def _release_the_answer(user: str) -> None:
	frappe.cache().delete(_claim_key(user))


def _is_stream_cancelled(session_id: str) -> bool:
	"""Return True once per cancel: reading consumes the flag, so it cannot stop a later turn."""
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
	"""Return the caller's last modified chat and the newest limit (1 to 200) of its messages, oldest first.

	Returns:
		{"session_id": str | None, "messages": [{"id", "role", "content", "timestamp"}]}, where session_id is
		None when the caller has no chat and timestamp is ISO 8601 UTC.
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
		order_by="creation desc",
		limit=safe_limit,
	)
	# newest `limit` rows, then back into reading order; ascending would page from the chat's first message
	rows.reverse()
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
	"""ISO 8601 UTC with a Z: a naive Frappe time is in System Settings' zone, and JS reads it as local."""
	import datetime as _dt

	from frappe.utils import get_datetime, get_system_timezone

	if value is None:
		return None

	dt = get_datetime(value) if not isinstance(value, _dt.datetime) else value
	if dt is None:
		return None

	if dt.tzinfo is None:
		# Naive Frappe datetime: localise to the system timezone first.
		from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

		try:
			dt = dt.replace(tzinfo=ZoneInfo(get_system_timezone()))
		except (ZoneInfoNotFoundError, ValueError):
			# a System Settings time_zone this host's tz database has no entry for; anything else is a bug
			dt = dt.replace(tzinfo=_dt.timezone.utc)

	utc_dt = dt.astimezone(_dt.timezone.utc)
	# Replace "+00:00" with "Z" for the canonical UTC suffix the FE expects.
	return utc_dt.isoformat().replace("+00:00", "Z")


_ALLOWED_PAGE_CONTEXT_KEYS = ("route", "doctype", "docname", "currency")


def _sanitize_page_context(raw) -> dict:
	"""Keep the allowed keys with non-empty string values; raw is a dict or, over HTTP, its JSON string."""
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
@rate_limit(limit=_STARTS_PER_MINUTE, seconds=60)
def start_stream(message: str, session_id: str | None = None, page_context=None) -> dict:
	"""Enqueue the agent relay and return {"session_id"}; subscribe to frappe_ai:chunk:<session_id> first."""
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

	timeout_seconds = settings.agent_timeout()
	# before any side effect: a refused start must not clear the running answer's cancel flag below
	job_id = _STREAM_JOB_PREFIX + user
	if not _claim_the_answer(user, timeout_seconds + _STREAM_CLAIM_MARGIN_SECONDS):
		frappe.throw(
			_("A response is already in progress. Wait for it to finish or stop it, then try again.")
		)

	# nothing below reaches the worker that would release the claim, so a failure here gives it back
	try:
		if not session_id:
			session_id = str(uuid.uuid4())

		agent_url = _agent_url()
		_check_agent_url(agent_url)

		# a Stop that landed after the previous answer's last line would otherwise cancel this one
		frappe.cache.delete_value(_cancel_key(session_id))

		# RQ keeps a job's arguments for days and shows them to System Managers, so the job gets a key to the sid
		sid_key = frappe.generate_hash(length=32)
		frappe.cache.set_value(
			_SID_KEY_PREFIX + sid_key, frappe.session.sid, expires_in_sec=timeout_seconds + 30
		)

		frappe.enqueue(
			"frappe_ai.api.chat._stream_to_agent",
			queue="long",
			job_id=job_id,
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
	except Exception:
		_release_the_answer(user)
		raise

	return {"session_id": session_id}


_SID_KEY_PREFIX = "frappe_ai:sid:"

# one line per way the relay can fail; the address, the status and the stack stay in the Error Log
_SIGNED_OUT = "Session expired. Please sign in again."
_TOO_MANY_QUESTIONS = "Too many questions in a short time. Wait a minute, then try again."
_STOPPED_PART_WAY = "The assistant stopped part-way through the answer. Send your message again."
_UNREACHABLE = "The assistant is unreachable. Try again in a few minutes."
_CUT_OFF = "The answer was cut off. Send your message again."
_FAILED = "Failed to get response"


def _failure_message(exc: Exception, streaming: bool) -> str:
	"""The line the user reads for this failure; streaming is True once the agent had accepted the request."""
	status = getattr(getattr(exc, "response", None), "status_code", None)
	if status == 401:
		return _SIGNED_OUT
	if status == 429:
		return _TOO_MANY_QUESTIONS
	if status is not None:
		return _FAILED
	if isinstance(exc, requests.exceptions.ChunkedEncodingError):
		return _CUT_OFF
	return _STOPPED_PART_WAY if streaming else _UNREACHABLE


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
	timeout_seconds: int,
	page_context: dict | None = None,
) -> None:
	"""The RQ job relaying the agent's chunks to user over realtime; never whitelist it: it trusts user."""
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
	streaming = False  # the agent accepted the request, so a later failure is an answer that broke off

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
			streaming = True

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
			{"type": "error", "message": _failure_message(e, streaming)},
			user=user,
			after_commit=False,
		)
		done_received = True
		done_source = "error"
	except Exception:  # noqa: BLE001 - whatever failed, the browser is waiting on an end-of-stream only this job sends
		# Logged here, not re-raised: Frappe's job log records every frame's variables, and this frame holds the question
		frappe.log_error(title="AI Agent Stream Failed", message=frappe.get_traceback())
		frappe.publish_realtime(
			event_name,
			{"type": "error", "message": _FAILED},
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

	_release_the_answer(user)
