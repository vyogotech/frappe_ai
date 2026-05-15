/**
 * Message state with socketio-relay streaming support.
 *
 * Flow:
 *   1. Browser subscribes frappe.realtime.on("frappe_ai:chunk:<session_id>", handler)
 *   2. Browser calls frappe_ai.api.chat.start_stream — server enqueues the relay
 *      and returns {session_id} immediately, freeing the gunicorn worker.
 *   3. Background worker (queue=long) consumes the agent SSE stream and publishes
 *      each chunk via frappe.publish_realtime("frappe_ai:chunk:<session_id>", chunk).
 *   4. Browser receives chunks via the existing realtime subscription.
 *
 * Chunk types from the relay:
 *   {type:"content",  text:"..."}          – plain-text token
 *   {type:"done",     tools_called:[]}     – stream complete
 *   {type:"error",    message:"..."}       – agent or relay error
 */

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

// Frontend safety-net: bound how long sendMessage() can hang before
// settle("reject") fires. Keep this generous (and >= the server-side
// `AI Assistant Settings.timeout` so the relay surfaces its own error
// first when it can), since chart prompts that fan out to multiple
// tools routinely take 60–90s end-to-end. A user-visible "timed out"
// is preferable to a never-resolving spinner if everything else
// breaks; 2 minutes is the upper bound we want to wait.
const CLIENT_TIMEOUT_MS = 120_000;

export function useChat() {
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const canCancel = ref(false);
  const lastError = ref<string | null>(null);

  // Holds a resolve callback so cancelMessage() can cleanly settle the stream promise.
  let _resolveStream: (() => void) | null = null;
  let _activeEventName: string | null = null;

  // Conversation-scoped session id. Reused across sendMessage() calls so
  // Frappe groups all turns under the same AI Chat Session row (used for
  // sidebar scrollback). The agent itself does not yet replay prior turns
  // into the LLM context (run_agent_loop receives history=None) — this id
  // is purely a persistence handle today. Cleared by clearMessages()
  // ("New conversation") to start a fresh row.
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

    // Per-call settlement guard. Every path that finalises the stream
    // (done chunk, error chunk, frappe.call error, client timeout, cancel)
    // sets this true and short-circuits any later attempts. Two error
    // bubbles can otherwise appear when, for example, an "error" chunk
    // arrives just before the client timeout fires and both rejection
    // paths run their side effects before Promise.race could disambiguate.
    let settled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Reuse the conversation's session id if we already have one so the
      // agent can recall prior turns. First message in a conversation mints
      // a fresh id; subsequent ones reuse it. The agent's "session" chunk
      // (below) may override with the canonical id it persisted.
      const sessionId = _conversationId ?? crypto.randomUUID();
      _conversationId = sessionId;
      const eventName = `frappe_ai:chunk:${sessionId}`;
      _activeEventName = eventName;

      await new Promise<void>((resolve, reject) => {
        // Centralised teardown so every settlement path looks identical:
        // unsubscribe, clear the safety-net timer, drop the cancel
        // affordance, mark settled. Subsequent calls (from a late chunk,
        // a stale timer, a duplicate frappe.call error) become no-ops.
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
          _activeEventName = null;
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
              // Merge consecutive text chunks into the same fragment so a
              // streaming reply still renders as one markdown block. Only
              // start a new text part when the last fragment was a block —
              // that's what preserves the arrival order in the renderer.
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
            // Structured blocks (table/chart/kpi/status) — append to the
            // message so MessageBubble.vue renders them via getBlockComponent.
            // The fragment is also pushed onto `parts` at its arrival
            // position so subsequent text chunks render BELOW it instead
            // of being silently inserted above (the historical bug where
            // late text "jumped over" an already-rendered table).
            const block = chunk.block as unknown as import("../types").ContentBlock;
            _updateMessage(assistantId, (m) => {
              if (!m.blocks) m.blocks = [];
              m.blocks.push(block);
              if (!m.parts) m.parts = [];
              m.parts.push({ kind: "block", block });
              m.pending = false;
            });
          } else if (chunk.type === "tool_call" && chunk.name) {
            // Surface tool invocations as their own bubble so the user can
            // see what the agent looked up. The relay only emits the call
            // (no separate result event today); render in "done" state so
            // the card isn't stuck in a perpetual "running" spinner.
            //
            // Insert just before the assistant placeholder so the visible
            // order matches the agent's actual sequence. If the placeholder
            // isn't found (e.g. an error path removed it before a late tool
            // chunk arrived), drop the card rather than appending out of
            // order — the `settled` short-circuit above should normally
            // prevent reaching this branch in that state.
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
          error: (err: unknown) => settle("reject", err instanceof Error ? err : new Error(String(err))),
        });

        // Safety net: if the RQ worker dies without emitting "done" or
        // "error", the promise above never settles. Schedule a hard
        // timeout that flows through `settle()` like every other
        // settlement path, so a late chunk arriving after the timer
        // can't add a second error bubble.
        timerId = setTimeout(
          () => settle("reject", new Error("Response timed out. Please try again.")),
          CLIENT_TIMEOUT_MS,
        );
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

  function cancelMessage(): void {
    if (_resolveStream) _resolveStream();
  }

  function clearMessages(): void {
    messages.value = [];
    isLoading.value = false;
    lastError.value = null;
    // "New conversation" — drop the session id so the next message opens
    // a fresh AI Chat Session row.
    _conversationId = null;
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
    } catch (err) {
      // Swallow — restoring history is a nice-to-have, not a blocker.
      console.warn("[Frappe AI] loadRecentConversation failed", err);
    }
  }

  /** Update an assistant message in-place by id.
   *
   * Restricted to assistant messages because that's the only role that
   * receives streamed chunks. Tightening the callback parameter type
   * means callers can write `m.blocks` / `m.pending` without manual
   * narrowing.
   */
  function _updateMessage(id: string, updater: (m: AssistantMessage) => void): void {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const target = messages.value[idx];
    if (target.role !== "assistant") return;
    // Mutate in place. Vue 3's reactive proxy detects nested property
    // writes, so the splice-clone pattern used previously was wasteful:
    // for a long streamed response it copied the message object on every
    // chunk and triggered a deep watch in ChatMessages.vue (O(N²) over
    // message length). In-place mutation drops both costs.
    updater(target);
  }

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
