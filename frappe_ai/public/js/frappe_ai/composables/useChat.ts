/** Chat state; a reply streams from the server's relay (api.chat.start_stream) over frappe.realtime. */

import { ref, readonly } from "vue";
import type { AssistantMessage, Message } from "../types/messages";
import { getPageContext } from "../utils/context";

interface Chunk {
	type: "content" | "content_block" | "tool_call" | "done" | "error" | "session";
	text?: string;
	message?: string;
	tools_called?: string[];
	// For chunk.type === "session" the agent echoes back the canonical id it
	// wants the client to use for subsequent turns in this conversation.
	id?: string;
	// For chunk.type === "content_block" the parsed block payload
	// (table | chart | kpi | status | text) the FE will render via the block
	// component registry.
	block?: Record<string, unknown> & { type: string };
	// For chunk.type === "tool_call" — name + arguments of the agent's invocation.
	name?: string;
	arguments?: Record<string, unknown>;
}

interface StreamResult {
	session_id: string;
}

// keep >= AI Assistant Settings.timeout, so the relay's own error reaches the user first
// ponytail: fixed at that field's 120 s default though it accepts up to 300 s; read it via useSettings if raised
const CLIENT_TIMEOUT_MS = 120_000;

// frappe.call rejects with a plain object whose _server_messages is double-encoded JSON; String(err) is "[object Object]"
function _toError(err: unknown): Error {
	if (err instanceof Error) return err;
	if (typeof err === "string") return new Error(err);
	if (err && typeof err === "object") {
		const e = err as Record<string, unknown>;
		// Frappe surfaces validation errors via _server_messages: JSON array of
		// JSON-encoded {message, indicator} objects. Try the first one.
		const sm = e._server_messages;
		if (typeof sm === "string") {
			try {
				const arr = JSON.parse(sm);
				if (Array.isArray(arr) && arr.length > 0) {
					const first = typeof arr[0] === "string" ? JSON.parse(arr[0]) : arr[0];
					if (
						first &&
						typeof first === "object" &&
						typeof (first as { message?: unknown }).message === "string"
					) {
						return new Error((first as { message: string }).message);
					}
				}
			} catch {
				// fall through to other extraction paths
			}
		}
		if (typeof e.message === "string" && e.message) return new Error(e.message);
		if (typeof e.exception === "string" && e.exception) {
			// "frappe.exceptions.ValidationError: actual message" — strip the prefix.
			return new Error(e.exception.replace(/^[\w.]+Error:\s*/, ""));
		}
		if (typeof e.exc_type === "string" && e.exc_type) return new Error(e.exc_type);
	}
	return new Error("Failed to get response");
}

export function useChat() {
	const messages = ref<Message[]>([]);
	const isLoading = ref(false);
	const canCancel = ref(false);
	const lastError = ref<string | null>(null);

	// Holds a resolve callback so cancelMessage() can cleanly settle the stream promise.
	let _resolveStream: (() => void) | null = null;

	// reused across turns, or the agent loses the conversation's history
	let _conversationId: string | null = null;

	async function sendMessage(content: string): Promise<void> {
		if (!content.trim() || isLoading.value) return;

		const userMessage: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content,
			timestamp: new Date(),
		};
		messages.value.push(userMessage);
		isLoading.value = true;
		lastError.value = null;

		const assistantId = crypto.randomUUID();
		const assistantMessage: Message = {
			id: assistantId,
			role: "assistant",
			content: "",
			// Initialise the ordered fragment list so chunk handlers can append
			// text/block fragments without first checking presence.
			parts: [],
			pending: true,
			timestamp: null,
		};
		messages.value.push(assistantMessage);

		// every ending (done, error chunk, call error, timeout, cancel) goes through settle(), or two error bubbles appear
		let settled = false;
		let timerId: ReturnType<typeof setTimeout> | undefined;

		try {
			const sessionId = _conversationId ?? crypto.randomUUID();
			_conversationId = sessionId;
			const eventName = `frappe_ai:chunk:${sessionId}`;

			await new Promise<void>((resolve, reject) => {
				const settle = (kind: "resolve" | "reject", payload?: unknown) => {
					if (settled) return;
					settled = true;
					if (timerId !== undefined) {
						clearTimeout(timerId);
						timerId = undefined;
					}
					frappe.realtime.off(eventName);
					canCancel.value = false;
					_resolveStream = null;
					if (kind === "resolve") {
						resolve();
					} else {
						reject(payload as Error);
					}
				};

				// Expose cancel capability before the realtime listener is registered
				// so the stop button can appear as soon as the request is in-flight.
				_resolveStream = () => {
					_updateMessage(assistantId, (m) => {
						m.pending = false;
						if (!m.timestamp) m.timestamp = new Date();
					});
					settle("resolve");
				};
				canCancel.value = true;

				frappe.realtime.on(eventName, (chunk: Chunk) => {
					if (settled) return;
					if (chunk.type === "session" && chunk.id) {
						// The agent persisted the conversation under this canonical id
						// (which may differ from the optimistic UUID we minted). Adopt
						// it so subsequent turns continue saving against the same row.
						_conversationId = chunk.id;
					} else if (chunk.type === "content" && chunk.text) {
						_updateMessage(assistantId, (m) => {
							m.content += chunk.text;
							// one text part per run of chunks, so markdown split across chunks still renders as one block
							if (!m.parts) m.parts = [];
							const last = m.parts[m.parts.length - 1];
							if (last && last.kind === "text") {
								last.text += chunk.text;
							} else {
								m.parts.push({ kind: "text", text: chunk.text as string });
							}
							m.pending = false;
						});
					} else if (chunk.type === "content_block" && chunk.block) {
						// also pushed onto parts in arrival order, or text that comes later renders above the block
						const block = chunk.block as unknown as import("../types").ContentBlock;
						_updateMessage(assistantId, (m) => {
							if (!m.blocks) m.blocks = [];
							m.blocks.push(block);
							if (!m.parts) m.parts = [];
							m.parts.push({ kind: "block", block });
							m.pending = false;
						});
					} else if (chunk.type === "tool_call" && chunk.name) {
						// status "done": the relay sends no tool-result event, so "running" would spin forever;
						// no placeholder left means an error removed it, so drop the card rather than append it out of order
						const assistantIdx = messages.value.findIndex((m) => m.id === assistantId);
						if (assistantIdx < 0) return;
						const toolCallMessage: Message = {
							id: crypto.randomUUID(),
							role: "tool_call",
							content: "",
							toolCall: {
								call_id: crypto.randomUUID(),
								name: chunk.name,
								arguments: chunk.arguments ?? {},
								status: "done",
								timestamp: new Date(),
							},
							timestamp: new Date(),
						};
						messages.value.splice(assistantIdx, 0, toolCallMessage);
					} else if (chunk.type === "done") {
						_updateMessage(assistantId, (m) => {
							m.pending = false;
							m.timestamp = new Date();
						});
						settle("resolve");
					} else if (chunk.type === "error") {
						settle("reject", new Error(chunk.message ?? "Agent error"));
					}
				});

				frappe.call<StreamResult>({
					method: "frappe_ai.api.chat.start_stream",
					args: {
						message: content,
						session_id: sessionId,
						// Inject route/doctype/docname/currency so the agent prompt
						// can ground answers in the user's current page. The relay
						// forwards this dict into the agent's `context` payload.
						page_context: getPageContext(),
					},
					error: (err: unknown) => settle("reject", _toError(err)),
				});

				// a worker that dies without "done" or "error" would leave the promise pending forever
				timerId = setTimeout(() => {
					_serverCancelInFlight(); // the worker would otherwise go on calling tools for an answer nobody waits for
					settle("reject", new Error("Response timed out. Please try again."));
				}, CLIENT_TIMEOUT_MS);
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to get response";
			lastError.value = msg;
			// Remove the empty assistant placeholder and add a typed error message.
			messages.value = messages.value.filter((m) => m.id !== assistantId);
			_addErrorMessage(msg);
		} finally {
			isLoading.value = false;
			canCancel.value = false;
			_resolveStream = null;
		}
	}

	function _serverCancelInFlight(): void {
		// settle() only ends the stream in this tab; without this the worker keeps relaying and the model keeps generating
		if (!_conversationId) return;
		frappe.call({
			method: "frappe_ai.api.chat.cancel_stream",
			args: { session_id: _conversationId },
		});
	}

	function cancelMessage(): void {
		_serverCancelInFlight();
		if (_resolveStream) _resolveStream();
	}

	function clearMessages(): void {
		// settle an in-flight stream first, or its orphaned chunk listener races the next sendMessage and empties its bubble
		if (isLoading.value) _serverCancelInFlight();
		if (_resolveStream) _resolveStream();
		messages.value = [];
		isLoading.value = false;
		lastError.value = null;
		// "New conversation" — drop the session id so the next message opens
		// a fresh AI Chat Session row.
		_conversationId = null;
	}

	// sendBeacon survives the unload, so a tab closed mid-stream still stops the worker
	if (typeof window !== "undefined") {
		window.addEventListener("beforeunload", () => {
			if (!isLoading.value || !_conversationId) return;
			try {
				const blob = new Blob(
					[
						JSON.stringify({
							session_id: _conversationId,
							csrf_token: frappe.csrf_token,
						}),
					],
					{ type: "application/json" },
				);
				navigator.sendBeacon("/api/method/frappe_ai.api.chat.cancel_stream", blob);
			} catch {
				// best-effort
			}
		});
	}

	interface RecentMessagesResponse {
		session_id: string | null;
		messages: Array<{ id: string; role: string; content: string; timestamp: string | null }>;
	}

	async function loadRecentConversation(): Promise<void> {
		// Hydrate the sidebar on mount so a page reload doesn't throw away the
		// user's last chat. Best-effort: any failure leaves the bubble list
		// empty so the user can simply start a new conversation.
		try {
			const result = await new Promise<RecentMessagesResponse>((resolve, reject) => {
				frappe.call<RecentMessagesResponse>({
					method: "frappe_ai.api.chat.get_recent_messages",
					args: { limit: 50 },
					callback: (r) => resolve(r?.message ?? { session_id: null, messages: [] }),
					error: reject,
				});
			});

			if (!result || !result.session_id || result.messages.length === 0) return;

			_conversationId = result.session_id;
			// Skip rows whose role we can't faithfully render (e.g. persisted
			// "tool" messages — we don't have the toolCall metadata in the
			// hydrated row). Better to omit than to mislabel them as user input.
			messages.value = result.messages
				.filter((m) => m.role === "user" || m.role === "assistant")
				.map((m) => ({
					id: m.id,
					role: m.role as "user" | "assistant",
					content: m.content,
					timestamp: m.timestamp ? new Date(m.timestamp) : null,
				}));
		} catch {
			// Swallow — restoring history is a nice-to-have, not a blocker.
		}
	}

	/** Update the assistant message with this id in place; no-op for another role, which gets no chunks. */
	function _updateMessage(id: string, updater: (m: AssistantMessage) => void): void {
		const idx = messages.value.findIndex((m) => m.id === id);
		if (idx < 0) return;
		const target = messages.value[idx];
		if (target.role !== "assistant") return;
		// in place: Vue tracks nested writes, and copying the message on every chunk is quadratic over a long reply
		updater(target);
	}

	interface MsgAddedPayload {
		session_id: string;
		id: string;
		role: "user" | "assistant" | "tool";
		content: string;
		timestamp: string | null;
	}
	frappe.realtime.on("frappe_ai:msg_added", (payload: MsgAddedPayload) => {
		if (!payload || payload.session_id !== _conversationId) return;
		if (isLoading.value) return; // active tab handles its own turn via chunks
		if (payload.role !== "user" && payload.role !== "assistant") return;
		if (messages.value.some((m) => m.id === payload.id)) return;
		messages.value.push({
			id: payload.id,
			role: payload.role,
			content: payload.content,
			timestamp: payload.timestamp ? new Date(payload.timestamp) : null,
		});
	});

	function _addErrorMessage(message: string): void {
		lastError.value = message;
		messages.value.push({
			id: crypto.randomUUID(),
			role: "error",
			content: message,
			error: { code: "REQUEST_FAILED", message },
			timestamp: new Date(),
		});
	}

	return {
		messages,
		isLoading: readonly(isLoading),
		canCancel: readonly(canCancel),
		lastError: readonly(lastError),
		sendMessage,
		cancelMessage,
		clearMessages,
		loadRecentConversation,
	};
}
