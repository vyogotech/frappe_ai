/**
 * Message state with SSE streaming support.
 *
 * Flow:
 *   1. If agentUrl is set, POST directly to the frappe-ai-agent with
 *      Accept: text/event-stream and stream tokens as they arrive. The
 *      Frappe session cookie is forwarded via credentials: "include"; the
 *      agent uses that sid for every downstream MCP tool call.
 *   2. Otherwise fall back to frappe.call() (non-streaming).
 *
 * SSE event types from /api/v1/chat:
 *   {type:"session",       id:"AICS-0001"}          – server session id
 *   {type:"status",        message:"..."}           – thinking / tool status
 *   {type:"tool_call",     name:"...", arguments:{}} – tool invocation
 *   {type:"content",       text:"..."}              – plain-text chunk
 *   {type:"content_block", block:{type:"...",...}}  – structured block
 *   {type:"done",          tools_called:[], data_quality:"high"}
 *   {type:"error",         message:"..."}
 */

import { ref, readonly } from "vue";
import { getPageContext } from "@/utils/context";
import type { Message, ContentBlock, MessagePart } from "@/types";

/**
 * Wire shape from frappe_ai.api.ai_query.query (the non-streaming fallback).
 * The endpoint may return a bare string (legacy) or a structured object.
 */
interface FallbackToolCall {
  call_id?: string;
  name: string;
  arguments?: Record<string, unknown>;
  result?: string;
  success?: boolean;
}

type FallbackResponseMessage =
  | string
  | {
      response?: string;
      content?: string;
      blocks?: Record<string, unknown>[];
      tool_calls?: FallbackToolCall[];
    };

/**
 * SSE event shapes emitted by /api/v1/chat. Mirrors the union documented in
 * the file header; new event types must be added here AND in the switch
 * inside _handleSSEEvent.
 */
type SSEEvent =
  | { type: "session"; id?: string }
  | { type: "status"; message?: string }
  | { type: "tool_call"; name?: string; arguments?: Record<string, unknown>; call_id?: string }
  | { type: "content"; text?: string }
  | { type: "content_block"; block?: Record<string, unknown> }
  | { type: "done"; tools_called?: string[]; data_quality?: string }
  | { type: "error"; message?: string };


const VALID_BLOCK_TYPES = new Set(["text", "chart", "table", "kpi", "status_list"]);

function isValidBlock(block: Record<string, unknown>): boolean {
  return typeof block.type === "string" && VALID_BLOCK_TYPES.has(block.type);
}

// Shared (module-level) agent URL fetched once after settings load.
let _agentUrl = "";
export function setAgentUrl(url: string): void {
  _agentUrl = url.replace(/\/$/, ""); // strip trailing slash
}

export function useChat() {
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  // True only while an SSE request is in flight (AbortController
  // exists). Fallback mode (frappe.call()) stays false so ChatInput
  // keeps Send disabled instead of showing a Stop it can't honor.
  const canCancel = ref(false);
  const lastError = ref<string | null>(null);
  // Per-composable-instance so two independent useChat() call sites
  // don't share an abort controller. The `isLoading` guard still
  // prevents a single instance from starting a concurrent send.
  let currentAbort: AbortController | null = null;
  // Server-assigned session id. Sent back on every follow-up message so
  // the agent writes history into the SAME AI Chat Session row instead
  // of creating a new one per turn. Populated on the first reply via
  // the SSE `session` event; cleared by clearMessages.
  const sessionId = ref<string | null>(null);

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  function sendMessage(content: string): void {
    if (!content.trim() || isLoading.value) return;

    messages.value.push({
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    });

    isLoading.value = true;
    lastError.value = null;

    if (_agentUrl) {
      _sendSSE(content);
    } else {
      _sendFallback(content);
    }
  }

  function clearMessages(): void {
    messages.value = [];
    isLoading.value = false;
    lastError.value = null;
    sessionId.value = null;
  }

  function cancelMessage(): void {
    currentAbort?.abort();
  }

  // --------------------------------------------------------------------------
  // SSE path – fetch() streaming directly to the frappe-ai-agent
  // --------------------------------------------------------------------------

  async function _sendSSE(content: string): Promise<void> {
    const ctx = getPageContext();
    const body = JSON.stringify({
      message: content,
      session_id: sessionId.value,
      context: {
        user_id: frappe?.session?.user ?? "",
        user_email: frappe?.session?.user ?? "",
        timestamp: new Date().toISOString(),
        ...ctx,
      },
    });

    // Placeholder assistant message that we stream tokens into. It
    // carries `pending: true` so MessageBubble renders the in-bubble
    // "Thinking…" / contextual-status block until the first content
    // chunk arrives (or the stream ends / is aborted).
    const assistantId = crypto.randomUUID();
    messages.value.push({
      id: assistantId,
      role: "assistant",
      content: "",
      blocks: [],
      parts: [],
      timestamp: null,  // Set at stream completion (done event) — see Fix 3a
      pending: true,
    });
    messages.value = [...messages.value];

    currentAbort = new AbortController();
    canCancel.value = true;

    try {
      const resp = await fetch(`${_agentUrl}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "include",
        body,
        signal: currentAbort.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Server returned ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by \n\n
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? ""; // keep incomplete tail

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const ev = JSON.parse(payload);
              _handleSSEEvent(ev, assistantId);
            } catch {
              // malformed event — ignore
            }
          }
        }
      }
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : undefined;
      const errMessage = err instanceof Error ? err.message : undefined;
      if (errName === "AbortError") {
        // User-initiated cancel. Keep whatever streamed, drop an
        // empty placeholder, mark any running tool_calls as cancelled,
        // and don't surface an error bubble.
        const idx = messages.value.findIndex((m) => m.id === assistantId);
        if (idx >= 0) {
          const placeholder = messages.value[idx];
          const hasContent =
            (placeholder.content?.length ?? 0) > 0 ||
            (placeholder.blocks?.length ?? 0) > 0;
          if (hasContent) {
            _updateMessage(assistantId, (m) => {
              m.pending = false;
              m.metadata = { ...m.metadata, statusText: undefined };
            });
          } else {
            _removeMessage(assistantId);
          }
        }
        messages.value = messages.value.map((m) => {
          if (m.role === "tool_call" && m.toolCall?.status === "running") {
            return {
              ...m,
              toolCall: { ...m.toolCall, status: "cancelled" as const },
            };
          }
          return m;
        });
      } else {
        _removeMessage(assistantId);
        _addErrorMessage(errMessage ?? "Stream failed");
      }
    } finally {
      currentAbort = null;
      canCancel.value = false;
      isLoading.value = false;
    }
  }

  function _handleSSEEvent(ev: SSEEvent, assistantId: string): void {
    switch (ev.type) {
      case "session":
        // Server-assigned id for this conversation. Remember it so the
        // next sendMessage() sends it back in the request body, keeping
        // follow-up messages inside the same AI Chat Session row.
        if (typeof ev.id === "string" && ev.id) {
          sessionId.value = ev.id;
        }
        break;

      case "status":
        // Update the placeholder assistant message with thinking text.
        _updateMessage(assistantId, (m) => {
          m.metadata = { ...m.metadata, statusText: ev.message };
        });
        break;

      case "tool_call": {
        const tcId = crypto.randomUUID();
        const idx = messages.value.findIndex((m) => m.id === assistantId);
        // Insert tool_call message immediately before the assistant placeholder.
        const toolMsg: Message = {
          id: tcId,
          role: "tool_call",
          content: "",
          toolCall: {
            call_id: tcId,
            name: ev.name ?? "unknown",
            arguments: ev.arguments ?? {},
            success: true,
            status: "running",
          },
          timestamp: new Date(),
        };
        if (idx >= 0) {
          messages.value.splice(idx, 0, toolMsg);
        } else {
          messages.value.push(toolMsg);
        }
        messages.value = [...messages.value];
        break;
      }

      case "content":
        if (ev.text) {
          _updateMessage(assistantId, (m) => {
            m.content += ev.text;
            m.pending = false;
            // Maintain parts: coalesce consecutive text tokens into the last
            // text part; push a new part if the last part is a block or parts
            // is empty.
            if (!m.parts) m.parts = [];
            const last = m.parts[m.parts.length - 1];
            if (last && last.kind === "text") {
              last.text += ev.text;
            } else {
              m.parts.push({ kind: "text", text: ev.text } as MessagePart);
            }
          });
        }
        break;

      case "content_block":
        // Structured blocks: tables, charts, KPIs, status lists, and
        // text blocks for prose between them. The server parses
        // <copilot-block> tags out of the LLM output and emits one
        // content_block event per block, preserving order.
        if (ev.block && isValidBlock(ev.block)) {
          // The server-side block parser already validates the schema; the
          // type narrows from Record<string, unknown> via the runtime check.
          const block = ev.block as unknown as ContentBlock;
          _updateMessage(assistantId, (m) => {
            if (!m.blocks) {
              m.blocks = [];
            }
            m.blocks.push(block);
            // Always push a new block part to preserve arrival order.
            if (!m.parts) m.parts = [];
            m.parts.push({ kind: "block", block } as MessagePart);
            m.pending = false;
          });
        }
        break;

      case "done":
        // Mark any running tool_calls as done.
        messages.value = messages.value.map((m) => {
          if (m.role === "tool_call" && m.toolCall?.status === "running") {
            return { ...m, toolCall: { ...m.toolCall, status: "done" as const } };
          }
          return m;
        });
        // Finalize the assistant placeholder — clear any transient
        // status, the pending flag, and assign the completion timestamp
        // so the chat bubble shows when the response finished, not when
        // streaming started (Fix 3a).
        _updateMessage(assistantId, (m) => {
          m.pending = false;
          m.timestamp = new Date();
          m.metadata = { ...m.metadata, statusText: undefined };
        });
        break;

      case "error":
        _removeMessage(assistantId);
        _addErrorMessage(ev.message ?? "Unknown error");
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Non-streaming fallback – frappe.call()
  // --------------------------------------------------------------------------

  function _sendFallback(content: string): void {
    if (typeof frappe === "undefined") {
      isLoading.value = false;
      _addErrorMessage("Frappe is not available");
      return;
    }
    frappe.call<FallbackResponseMessage>({
      method: "frappe_ai.api.ai_query.query",
      args: { message: content },
      async: true,
      callback: (r) => {
        isLoading.value = false;
        if (r?.message) {
          _handleResponse(r.message);
        } else {
          _addErrorMessage("No response from server");
        }
      },
      error: (err) => {
        isLoading.value = false;
        const serverMsg = err.responseJSON?._server_messages
          ? JSON.parse(err.responseJSON._server_messages)?.[0]
          : null;
        const errMsg = serverMsg ?? err.message ?? "Request failed";
        _addErrorMessage(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      },
    });
  }

  function _handleResponse(data: FallbackResponseMessage): void {
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      blocks: [],
      timestamp: new Date(),
    };

    if (typeof data === "string") {
      assistantMsg.content = data;
      messages.value.push(assistantMsg);
      messages.value = [...messages.value];
      return;
    }

    if (data.response) {
      assistantMsg.content = data.response;
    } else if (data.content) {
      assistantMsg.content = data.content;
    }

    if (Array.isArray(data.blocks)) {
      for (const block of data.blocks) {
        if (isValidBlock(block)) {
          assistantMsg.blocks!.push(block as unknown as ContentBlock);
        }
      }
    }

    if (Array.isArray(data.tool_calls)) {
      for (const tc of data.tool_calls) {
        messages.value.push({
          id: tc.call_id || crypto.randomUUID(),
          role: "tool_call",
          content: "",
          toolCall: {
            call_id: tc.call_id || crypto.randomUUID(),
            name: tc.name,
            arguments: tc.arguments || {},
            result: tc.result,
            success: tc.success !== false,
            status: tc.success !== false ? "done" : "error",
          },
          timestamp: new Date(),
        });
      }
    }

    messages.value.push(assistantMsg);
    messages.value = [...messages.value];
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function _updateMessage(id: string, updater: (m: Message) => void): void {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const copy = { ...messages.value[idx] };
    updater(copy);
    messages.value.splice(idx, 1, copy);
    messages.value = [...messages.value];
  }

  function _removeMessage(id: string): void {
    messages.value = messages.value.filter((m) => m.id !== id);
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
    messages.value = [...messages.value];
  }

  return {
    messages,
    isLoading: readonly(isLoading),
    canCancel: readonly(canCancel),
    lastError: readonly(lastError),
    sendMessage,
    cancelMessage,
    clearMessages,
  };
}
