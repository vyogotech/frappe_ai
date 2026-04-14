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
 *   {type:"status",    message:"..."}       – thinking / tool status
 *   {type:"tool_call", name:"...", arguments:{}} – tool invocation
 *   {type:"content",   text:"token"}        – LLM token
 *   {type:"done",      tools_called:[], data_quality:"high"}
 *   {type:"error",     message:"..."}
 */

import { ref, readonly } from "vue";
import { getPageContext } from "@/utils/context";
import type { Message, ContentBlock } from "@/types";

declare const frappe: any;

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
  const lastError = ref<string | null>(null);

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
  }

  // --------------------------------------------------------------------------
  // SSE path – fetch() streaming directly to the frappe-ai-agent
  // --------------------------------------------------------------------------

  async function _sendSSE(content: string): Promise<void> {
    const ctx = getPageContext();
    const body = JSON.stringify({
      message: content,
      context: {
        user_id: frappe.session?.user ?? "",
        user_email: frappe.session?.user ?? "",
        timestamp: new Date().toISOString(),
        ...ctx,
      },
    });

    // Placeholder assistant message that we stream tokens into.
    const assistantId = crypto.randomUUID();
    messages.value.push({
      id: assistantId,
      role: "assistant",
      content: "",
      blocks: [],
      timestamp: new Date(),
    });
    messages.value = [...messages.value];

    try {
      const resp = await fetch(`${_agentUrl}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "include",
        body,
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
    } catch (err: any) {
      _removeMessage(assistantId);
      _addErrorMessage(err?.message ?? "Stream failed");
    } finally {
      isLoading.value = false;
    }
  }

  function _handleSSEEvent(ev: any, assistantId: string): void {
    switch (ev.type) {
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
        // Clear the "thinking" indicator from the assistant message.
        _updateMessage(assistantId, (m) => {
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
    frappe.call({
      method: "frappe_ai.api.ai_query.query",
      args: { message: content },
      async: true,
      callback: (r: any) => {
        isLoading.value = false;
        if (r?.message) {
          _handleResponse(r.message);
        } else {
          _addErrorMessage("No response from server");
        }
      },
      error: (err: any) => {
        isLoading.value = false;
        const errMsg =
          err?.responseJSON?._server_messages
            ? JSON.parse(err.responseJSON._server_messages)?.[0]
            : err?.message || "Request failed";
        _addErrorMessage(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      },
    });
  }

  function _handleResponse(data: any): void {
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      blocks: [],
      timestamp: new Date(),
    };

    if (typeof data === "string") {
      assistantMsg.content = data;
    } else if (data.response) {
      assistantMsg.content = data.response;
    } else if (data.content) {
      assistantMsg.content = data.content;
    }

    if (Array.isArray(data.blocks)) {
      for (const block of data.blocks) {
        if (isValidBlock(block)) {
          assistantMsg.blocks!.push(block as ContentBlock);
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
    messages: readonly(messages),
    isLoading: readonly(isLoading),
    lastError: readonly(lastError),
    sendMessage,
    clearMessages,
  };
}
