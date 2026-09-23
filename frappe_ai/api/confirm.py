"""The user's answer to a write the model asked for, and the one-time grant the MCP server redeems (ADR-006)."""

import hashlib
import json

import frappe
from frappe import _

from frappe_ai.api.chat import (
	_ANSWER_IN_PROGRESS,
	_SID_KEY_PREFIX,
	_STREAM_CLAIM_MARGIN_SECONDS,
	_STREAM_JOB_PREFIX,
	_TOKEN_HANDOFF_PREFIX,
	_agent_url,
	_cancel_key,
	_check_agent_url,
	_claim_the_answer,
	_release_the_answer,
)

# the call the user is being asked about, keyed by the id the browser was given
_PENDING_KEY_PREFIX = "frappe_ai:confirm:"
# long enough to read the card and decide, short enough that a forgotten tab cancels itself
_PENDING_TTL_SECONDS = 300

# the grant for one write, minted only on the path a click takes
_TOKEN_KEY_PREFIX = "frappe_ai:confirm_token:"
_TOKEN_TTL_SECONDS = 120
# 48 hex characters is 192 bits: not guessable within the two minutes it is alive
_TOKEN_LENGTH = 48

_EXPIRED = "This request expired. Ask again to run it."


def _hash(token: str) -> str:
	return hashlib.sha256(token.encode()).hexdigest()


def _read(key: str) -> dict | None:
	"""The dict stored under key, or None; written by another process, so this one's memo of it is stale."""
	raw = frappe.cache.get_value(key, use_local_cache=False)
	if not isinstance(raw, str):
		return None
	try:
		record = json.loads(raw)
	except (json.JSONDecodeError, ValueError):
		return None
	return record if isinstance(record, dict) else None


def _pop(key: str) -> bool:
	"""Take key away from everyone else; True for the one caller whose DEL removed it."""
	# the raw DEL, not delete_value's UNLINK: its return is the whole of the one-time guarantee
	return frappe.cache().delete(frappe.cache().make_key(key)) == 1


def record_pending(chunk: dict, user: str, session_id: str) -> None:
	"""Record what the relay's tool_confirm chunk stands for, for the 300 s the user has to answer it."""
	confirmation_id = str(chunk.get("id") or "")
	tool = str(chunk.get("name") or "")
	if not confirmation_id or not tool:
		return
	arguments = chunk.get("arguments")
	frappe.cache.set_value(
		_PENDING_KEY_PREFIX + confirmation_id,
		json.dumps(
			{
				"user": user,
				"session": session_id,
				"tool": tool,
				"arguments": arguments if isinstance(arguments, dict) else {},
			}
		),
		expires_in_sec=_PENDING_TTL_SECONDS,
	)


@frappe.whitelist(methods=["POST"])
def respond(confirmation_id: str, decision: str) -> dict:
	"""Answer a pending write. "deny" drops it; "allow" starts the turn that runs exactly the recorded call."""
	if decision not in ("allow", "deny"):
		frappe.throw(_("Decision must be allow or deny."))

	user = frappe.session.user
	key = _PENDING_KEY_PREFIX + (confirmation_id or "")
	record = _read(key)
	# another user's id reads as an expired one: an id is not a thing to probe for
	if record is None or record.get("user") != user:
		frappe.throw(_(_EXPIRED))
		# frappe.throw always raises but is annotated -> None, so the checker still reads on (FOLLOWUPS, Q02)
		raise frappe.ValidationError(_EXPIRED)

	session_id = str(record.get("session") or "")
	tool = str(record.get("tool") or "")
	arguments = record.get("arguments") if isinstance(record.get("arguments"), dict) else {}
	doctype = str(arguments.get("doctype") or "")
	name = str(arguments.get("name") or "")
	logger = frappe.logger("frappe_ai", allow_site=True)

	if decision == "deny":
		frappe.cache.delete_value(key)
		logger.info(
			"confirm.denied user=%s session=%s tool=%s doctype=%s name=%s id=%s",
			user,
			session_id,
			tool,
			doctype,
			name,
			confirmation_id,
		)
		return {"ok": True}

	timeout_seconds = frappe.get_single("AI Assistant Settings").agent_timeout()
	# before the record is touched: a refused click is not an answer, so the card stays answerable
	if not _claim_the_answer(user, timeout_seconds + _STREAM_CLAIM_MARGIN_SECONDS):
		frappe.throw(_(_ANSWER_IN_PROGRESS))
	if not _pop(key):
		# a second click, or an expiry between the read above and here: the other one runs the write
		_release_the_answer(user)
		frappe.throw(_(_EXPIRED))

	# nothing below reaches the worker that would release the claim, so a failure here gives it back
	try:
		agent_url = _agent_url()
		_check_agent_url(agent_url)

		token = frappe.generate_hash(length=_TOKEN_LENGTH)
		frappe.cache.set_value(
			_TOKEN_KEY_PREFIX + _hash(token),
			json.dumps({"user": user, "session": session_id, "tool": tool, "doctype": doctype, "name": name}),
			expires_in_sec=_TOKEN_TTL_SECONDS,
		)
		# the same reason the sid below travels as a key: RQ keeps a job's arguments and shows them to System Managers
		token_key = frappe.generate_hash(length=32)
		frappe.cache.set_value(_TOKEN_HANDOFF_PREFIX + token_key, token, expires_in_sec=_TOKEN_TTL_SECONDS)

		# a Stop that landed after the pausing turn's last line would otherwise cancel this one
		frappe.cache.delete_value(_cancel_key(session_id))

		# RQ keeps a job's arguments for days and shows them to System Managers, so the job gets a key to the sid
		sid_key = frappe.generate_hash(length=32)
		frappe.cache.set_value(
			_SID_KEY_PREFIX + sid_key, frappe.session.sid, expires_in_sec=timeout_seconds + 30
		)

		frappe.enqueue(
			"frappe_ai.api.chat._stream_to_agent",
			queue="long",
			job_id=_STREAM_JOB_PREFIX + user,
			timeout=timeout_seconds + 30,
			enqueue_after_commit=True,
			message="",
			session_id=session_id,
			user=user,
			sid_key=sid_key,
			agent_url=agent_url,
			timeout_seconds=timeout_seconds,
			confirmation={"tool": tool, "arguments": arguments, "token_key": token_key},
		)
	# broad on purpose: it re-raises, so nothing is swallowed, and any narrower list would strand the claim
	except Exception:
		_release_the_answer(user)
		raise

	logger.info(
		"confirm.allowed user=%s session=%s tool=%s doctype=%s name=%s id=%s",
		user,
		session_id,
		tool,
		doctype,
		name,
		confirmation_id,
	)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def redeem(token: str, tool: str, doctype: str = "", name: str = "") -> dict:
	"""Spend the grant for one write, for the user it was minted for and the call it was minted from."""
	key = _TOKEN_KEY_PREFIX + _hash(token or "")
	grant = _read(key)
	if not _pop(key):
		frappe.throw(_(_EXPIRED))
	# one line for every failure: a caller who guesses is told nothing about what it guessed wrong
	if grant is None or (
		grant.get("user"),
		grant.get("tool"),
		grant.get("doctype"),
		grant.get("name"),
	) != (frappe.session.user, tool, doctype or "", name or ""):
		frappe.throw(_(_EXPIRED))
	return {"ok": True}
