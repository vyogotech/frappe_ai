/**
 * Message state with socketio-relay streaming support.
 *
 * Flow:
 *   1. Browser calls frappe.call({ method: "frappe_ai.api.chat.start_stream", ... })
 *      which opens SSE to the agent server-side and relays chunks via
 *      frappe.publish_realtime("frappe_ai:chunk:<session_id>", chunk).
 *   2. Browser subscribes via frappe.realtime.on("frappe_ai:chunk:<session_id>", handler)
 *      before making the frappe.call().
 *   3. The browser never directly contacts the agent URL.
 *
 * Chunk types from the relay:
 *   {type:"content",  text:"..."}           – plain-text token
 *   {type:"done",     tools_called:[]}      – stream complete
 *   {type:"error",    message:"..."}        – agent or relay error
 */

import { ref, readonly } from "vue";
import type { Message } from "../types";

// no-op: agent URL is now read from site_config server-side.
// Exported to avoid breaking any callers that still reference this.
export function setAgentUrl(_url: string): void {
  // no-op: agent URL is now read from site_config server-side
}

interface Chunk {
  type: "content" | "done" | "error";
  text?: string;
  message?: string;
  tools_called?: string[];
}

interface StreamResult {
  session_id: string;
}

export function useChat() {
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  // canCancel is always false in the socketio relay path — there is no
  // AbortController to cancel. Kept for ChatSidebar.vue compatibility.
  const canCancel = ref(false);
  const lastError = ref<string | null>(null);

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

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

    // Placeholder assistant message streamed into.
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
      timestamp: null,
    };
    messages.value.push(assistantMessage);
    messages.value = [...messages.value];

    try {
      const sessionId: string = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const eventName = `frappe_ai:chunk:${sessionId}`;

      await new Promise<void>((resolve, reject) => {
        frappe.realtime.on(eventName, (chunk: Chunk) => {
          if (chunk.type === "content" && chunk.text) {
            _updateMessage(assistantId, (m) => {
              m.content += chunk.text;
              m.pending = false;
            });
          } else if (chunk.type === "done") {
            _updateMessage(assistantId, (m) => {
              m.pending = false;
              m.timestamp = new Date();
            });
            frappe.realtime.off(eventName);
            resolve();
          } else if (chunk.type === "error") {
            frappe.realtime.off(eventName);
            reject(new Error(chunk.message ?? "Agent error"));
          }
        });

        frappe.call<StreamResult>({
          method: "frappe_ai.api.chat.start_stream",
          args: { message: content, session_id: sessionId },
          error: (err: unknown) => {
            frappe.realtime.off(eventName);
            reject(err);
          },
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get response";
      lastError.value = msg;
      _updateMessage(
        messages.value[messages.value.length - 1]?.id ?? "",
        (m) => {
          if (m.role === "assistant" && m.pending) {
            m.content = `Error: ${msg}`;
            m.pending = false;
            m.timestamp = new Date();
          }
        },
      );
      _addErrorMessage(msg);
      // Remove the empty/error assistant placeholder to avoid duplicate display.
      messages.value = messages.value.filter(
        (m) => !(m.role === "assistant" && m.content === `Error: ${msg}`),
      );
    } finally {
      isLoading.value = false;
    }
  }

  // no-op: socketio relay has no client-side abort mechanism.
  function cancelMessage(): void {
    // no-op
  }

  function clearMessages(): void {
    messages.value = [];
    isLoading.value = false;
    lastError.value = null;
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
