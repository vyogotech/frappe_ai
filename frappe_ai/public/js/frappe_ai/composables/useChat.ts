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
import type { Message } from "../types";

interface Chunk {
  type: "content" | "done" | "error";
  text?: string;
  message?: string;
  tools_called?: string[];
}

interface StreamResult {
  session_id: string;
}

const CLIENT_TIMEOUT_MS = 60_000;

export function useChat() {
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const canCancel = ref(false);
  const lastError = ref<string | null>(null);

  // Holds a resolve callback so cancelMessage() can cleanly settle the stream promise.
  let _resolveStream: (() => void) | null = null;
  let _activeEventName: string | null = null;

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
      pending: true,
      timestamp: null,
    };
    messages.value.push(assistantMessage);

    try {
      const sessionId = crypto.randomUUID();
      const eventName = `frappe_ai:chunk:${sessionId}`;
      _activeEventName = eventName;

      await Promise.race([
        new Promise<void>((resolve, reject) => {
          // Expose cancel capability before the realtime listener is registered
          // so the stop button can appear as soon as the request is in-flight.
          _resolveStream = () => {
            frappe.realtime.off(eventName);
            _updateMessage(assistantId, (m) => {
              m.pending = false;
              if (!m.timestamp) m.timestamp = new Date();
            });
            canCancel.value = false;
            _resolveStream = null;
            _activeEventName = null;
            resolve();
          };
          canCancel.value = true;

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
              canCancel.value = false;
              _resolveStream = null;
              _activeEventName = null;
              resolve();
            } else if (chunk.type === "error") {
              frappe.realtime.off(eventName);
              canCancel.value = false;
              _resolveStream = null;
              _activeEventName = null;
              reject(new Error(chunk.message ?? "Agent error"));
            }
          });

          frappe.call<StreamResult>({
            method: "frappe_ai.api.chat.start_stream",
            args: { message: content, session_id: sessionId },
            error: (err: unknown) => {
              frappe.realtime.off(eventName);
              canCancel.value = false;
              _resolveStream = null;
              _activeEventName = null;
              reject(err);
            },
          });
        }),

        // Safety net: if the RQ worker dies without emitting "done" or "error",
        // the stream promise above never settles. Race it against a hard timeout
        // so the UI never stays frozen permanently.
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            if (_activeEventName) {
              frappe.realtime.off(_activeEventName);
              _activeEventName = null;
            }
            canCancel.value = false;
            _resolveStream = null;
            reject(new Error("Response timed out. Please try again."));
          }, CLIENT_TIMEOUT_MS),
        ),
      ]);
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
  }

  function _updateMessage(id: string, updater: (m: Message) => void): void {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const copy = { ...messages.value[idx] };
    updater(copy);
    messages.value.splice(idx, 1, copy);
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
  };
}
