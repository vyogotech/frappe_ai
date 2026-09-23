import datetime as _dt
import functools
import ipaddress
import json
import socket
import uuid
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
# one line, two callers: api/confirm.py refuses an allowed write with the same words start_stream refuses a question
_ANSWER_IN_PROGRESS = "A response is already in progress. Wait for it to finish or stop it, then try again."

# the newest turns a question is answered against, and the cap on the blocks appended to one of them
_HISTORY_TURNS = 20
_HISTORY_BLOCK_CHARS = 4000
# how much of its first question names a chat in the sidebar
_TITLE_CHARS = 60


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


@functools.lru_cache(maxsize=4)
def _system_tzinfo(name: str) -> _dt.tzinfo:
	"""System Settings' time zone, or UTC and one log line where this host's tz database has no entry for it."""
	try:
		return ZoneInfo(name)
	except (ZoneInfoNotFoundError, ValueError):
		# silently assuming UTC moves every chat timestamp by the site's offset, with nothing to read it from
		frappe.logger("frappe_ai", allow_site=True).warning(
			"chat timestamps fall back to UTC: System Settings time zone %r is not in this host's tz database",
			name,
		)
		return _dt.UTC


def _to_iso_utc(value) -> str | None:
	"""ISO 8601 UTC with a Z: a naive Frappe time is in System Settings' zone, and JS reads it as local."""
	from frappe.utils import get_datetime, get_system_timezone

	if value is None:
		return None

	dt = get_datetime(value) if not isinstance(value, _dt.datetime) else value
	if dt is None:
		return None

	if dt.tzinfo is None:
		# Naive Frappe datetime: localise to the system timezone first.
		dt = dt.replace(tzinfo=_system_tzinfo(get_system_timezone()))

	utc_dt = dt.astimezone(_dt.UTC)
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


def _default_currency() -> str:
	"""The currency the caller's amounts are in when the page names none: their company's, else the site's, else ""."""
	currency = ""
	if "erpnext" in frappe.get_installed_apps():
		import erpnext

		# the user's default company's, which on a multi-company site is not the site-wide default below
		currency = erpnext.get_default_currency()
	return currency or frappe.db.get_default("currency") or ""


def _source_ref(item: dict) -> dict:
	"""A source as it is saved: the file and the passage's place in it, never the passage itself."""
	ref = {"file": item.get("file"), "seq": item.get("seq")}
	if item.get("attachment"):
		# a chat's attachment is in no Drive listing, so this row is the only copy of its name
		ref |= {"file_name": item.get("file_name"), "attachment": True}
	# no score rather than no field: a reader computes relevance from it, and a missing one is NaN
	return ref | {"distance": None}


def _tool_result_json(sources: list, blocks: list, usage: dict) -> str | None:
	"""What an answer carries besides its text, or None when it carries nothing; rag.status reads "usage"."""
	if not (sources or blocks or usage):
		return None
	# one ref per passage: the same file and seq can come back from more than one search in a turn
	refs = list({(s.get("file"), s.get("seq")): _source_ref(s) for s in sources}.values())
	return json.dumps({"sources": refs, "blocks": blocks} | ({"usage": usage} if usage else {}))


def _saved_answer(text: str, note: str) -> str:
	"""The row a turn leaves: the text that arrived and, when it stopped early, why it stops there."""
	if not note:
		return text
	text = text.rstrip()
	return f"{text}\n\n[incomplete] {note}" if text else f"[error] {note}"


def _with_blocks(content: str, tool_result_json) -> str:
	"""The answer as shown, blocks included: a follow-up such as "the first one" points at them."""
	try:
		blocks = json.loads(tool_result_json or "{}").get("blocks") or []
	except (ValueError, AttributeError):
		return content
	if not blocks:
		return content
	shown = json.dumps({"blocks": blocks}, separators=(",", ":"), ensure_ascii=False)[:_HISTORY_BLOCK_CHARS]
	return f"{content}\n\n{shown}" if content else shown


def _prior_turns(session_id: str, exclude: str = "") -> list[dict]:
	"""The chat's last turns as {"role", "content"}, oldest first: the context this turn is answered in."""
	rows = frappe.get_all(
		"AI Chat Message",
		filters={"session": session_id},
		fields=["name", "role", "content", "tool_result_json"],
		order_by="creation desc",
		limit=_HISTORY_TURNS,
	)
	turns = []
	for row in rows:
		content = row.content or ""
		if row.name == exclude or row.role not in ("user", "assistant"):
			continue
		if row.role == "assistant":
			if content.startswith("[error]"):
				continue  # a failed turn's error text was for the user, not an answer
			content = _with_blocks(content, row.tool_result_json)
		if content:
			turns.append({"role": row.role, "content": content})
	turns.reverse()
	return turns


def _collect(chunk: dict, saved: dict) -> None:
	"""Keep from this frame whatever the answer's row needs; a frame it needs nothing from is skipped."""
	kind = chunk.get("type")
	if kind == "content":
		saved["answer"].append(str(chunk.get("text") or ""))
	elif kind == "content_block" and isinstance(chunk.get("block"), dict):
		saved["blocks"].append(chunk["block"])
	elif kind == "sources":
		saved["sources"] += [s for s in (chunk.get("items") or []) if isinstance(s, dict)]
	elif kind == "error":
		# the agent's own line for a turn that stopped early, kept with the text that arrived
		saved["note"] = str(chunk.get("message") or "")
	elif kind == "done":
		saved["usage"] = chunk.get("usage") or {}


def _save_message(session_id: str, role: str, content: str, tool_result_json: str | None = None) -> str:
	"""Insert the turn's row and return its name, or "" when this chat already holds that row."""
	row = {"doctype": "AI Chat Message", "session": session_id, "role": role, "content": content}
	if tool_result_json:
		row["tool_result_json"] = tool_result_json
	try:
		return frappe.get_doc(row).insert().name
	# ponytail: the agent writes these rows too until ADR-011's other half lands, and a question it
	# copies is refused here; a question resent before any answer is refused with it, and goes unsaved
	except frappe.DuplicateEntryError:
		frappe.clear_last_message()
		return ""


def _save_the_answer(session_id: str, saved: dict) -> None:
	"""Write the turn's answer row; a chat deleted while it was answered has nowhere left to put one."""
	if not frappe.db.exists("AI Chat Session", session_id):
		return
	try:
		_save_message(
			session_id,
			"assistant",
			_saved_answer("".join(saved["answer"]), saved["note"]),
			_tool_result_json(saved["sources"], saved["blocks"], saved["usage"]),
		)
	except Exception:  # noqa: BLE001 - the answer is on screen; what is left to protect is the claim
		frappe.log_error(
			title="AI Chat Message Not Saved",
			message=frappe.get_traceback(),
			reference_doctype="AI Chat Session",
			reference_name=session_id,
		)


def _open_session(session_id: str, title: str, context_json: str) -> None:
	"""Open the chat if this is its first turn; a session id that is not the caller's is refused."""
	if frappe.db.exists("AI Chat Session", session_id):
		# get_doc applies no permission of its own, and session_id came from the caller
		frappe.get_doc("AI Chat Session", session_id).check_permission("write")
		return
	session = {
		"doctype": "AI Chat Session",
		"name": session_id,
		"title": title.strip()[:_TITLE_CHARS],
		"context_json": context_json,
	}
	frappe.get_doc(session).insert()


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=_STARTS_PER_MINUTE, seconds=60)
def start_stream(message: str, session_id: str | None = None, page_context=None) -> dict:
	"""Enqueue the relay, return {"session_id", "currency"} (the currency the agent was told to answer in, or "")."""
	if not message or not message.strip():
		frappe.throw(_("Message is required"))

	max_chars = _message_max_chars()
	if len(message) > max_chars:
		frappe.throw(_("Message too long (max {0} characters).").format(max_chars))

	user = frappe.session.user

	settings = frappe.get_single("AI Assistant Settings")
	if not settings.enabled:
		frappe.throw(_("AI Assistant is not enabled"))

	timeout_seconds = settings.agent_timeout()
	# before any side effect: a refused start must not clear the running answer's cancel flag below
	job_id = _STREAM_JOB_PREFIX + user
	if not _claim_the_answer(user, timeout_seconds + _STREAM_CLAIM_MARGIN_SECONDS):
		frappe.throw(_(_ANSWER_IN_PROGRESS))

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

		# the page names a currency only when the open document has one; for every other page this
		# is the answer's only chance at one, because the agent names none it was not given
		page_context = _sanitize_page_context(page_context)
		if not page_context.get("currency"):
			currency = _default_currency()
			if currency:
				page_context["currency"] = currency

		# frappe_ai owns both doctypes (ADR-011): the question is recorded here, before the worker
		# exists, so a worker that never runs still leaves the chat the user can see
		_open_session(session_id, message, json.dumps({"user_id": user} | page_context))
		question_row = _save_message(session_id, "user", message)

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
			page_context=page_context,
			question_row=question_row,
		)
	# broad on purpose: it re-raises, so nothing is swallowed, and any narrower list would strand the claim
	except Exception:
		_release_the_answer(user)
		raise

	return {"session_id": session_id, "currency": page_context.get("currency", "")}


_TOKEN_HANDOFF_PREFIX = "frappe_ai:confirm_handoff:"
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


def _take_sid(sid_key: str, prefix: str = _SID_KEY_PREFIX) -> str:
	"""What the enqueuing request left for this job under `prefix`; gone after the first read."""
	key = prefix + sid_key
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
	confirmation: dict | None = None,
	question_row: str = "",
) -> None:
	"""Relay the agent's chunks to user; never whitelist it: it trusts user, and a `confirmation` carries no message."""
	import time

	# at module level this would close the import cycle: confirm.py is built on this module
	from frappe_ai.api.confirm import record_pending

	logger = frappe.logger("frappe_ai", allow_site=True)
	context: dict = {"user_id": user}
	if page_context:
		# Merge the sanitised page context (route/doctype/docname/currency) into
		# the agent's request context. build_system_prompt() reads these keys.
		context.update(page_context)

	payload = {
		# Forward session_id so the agent groups all turns under the same AI Chat Session row, and
		# the turns before this one so that nothing is lost when it stops reading them back out of
		# Frappe itself — which it still does, until ADR-011's other half lands and it reads these.
		"session_id": session_id,
		"context": context,
		"history": _prior_turns(session_id, exclude=question_row),
	}
	# the agent takes exactly one of the two: a confirmed turn runs a call the user already saw
	if confirmation:
		# the token itself is never a job argument, so it is read here and spent by the agent
		call = dict(confirmation)
		token = _take_sid(call.pop("token_key", ""), _TOKEN_HANDOFF_PREFIX)
		confirmation = {**call, "token": token}
	payload["confirmation" if confirmation else "message"] = confirmation or message

	event_name = f"frappe_ai:chunk:{session_id}"
	done_received = False
	# the answer's row, assembled from the frames on their way to the browser
	saved: dict = {"answer": [], "blocks": [], "sources": [], "usage": {}, "note": ""}
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
				_collect(chunk, saved)
				if chunk.get("type") == "done":
					done_received = True
					done_source = "agent"
					# before the frame the browser settles on: a row inserted after it reaches the
					# tab as msg_added with an id it cannot match, and the answer renders twice
					_save_the_answer(session_id, saved)
				elif chunk.get("type") == "tool_confirm":
					# recorded before it is published: this record, not the chunk the browser holds, is
					# what a click is answered from, so a forged click can only name an id
					record_pending(chunk, user, session_id)

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
		# the one row an operator reads: the stream.done line below already carries session, duration and chunks
		frappe.log_error(
			title="AI Agent Stream Failed",
			message=frappe.get_traceback(),
			reference_doctype="AI Chat Session",
			reference_name=session_id,
		)
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
		frappe.log_error(
			title="AI Agent Stream Failed",
			message=frappe.get_traceback(),
			reference_doctype="AI Chat Session",
			reference_name=session_id,
		)
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
