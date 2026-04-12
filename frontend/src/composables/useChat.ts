/** Message state machine with HTTP POST via frappe.call(). */

import { ref, readonly } from "vue";
import { getPageContext } from "@/utils/context";
import type { Message, ContentBlock } from "@/types";

declare const frappe: any;

const VALID_BLOCK_TYPES = new Set(["text", "chart", "table", "kpi", "status_list"]);

function isValidBlock(block: Record<string, unknown>): boolean {
  return typeof block.type === "string" && VALID_BLOCK_TYPES.has(block.type);
}

export function useChat() {
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);

  function sendMessage(content: string): void {
    if (!content.trim() || isLoading.value) return;

    // Add user message
    messages.value.push({
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    });

    isLoading.value = true;
    lastError.value = null;

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

    // Extract text content
    if (typeof data === "string") {
      assistantMsg.content = data;
    } else if (data.response) {
      assistantMsg.content = data.response;
    } else if (data.content) {
      assistantMsg.content = data.content;
    }

    // Extract structured blocks if present
    if (Array.isArray(data.blocks)) {
      for (const block of data.blocks) {
        if (isValidBlock(block)) {
          assistantMsg.blocks!.push(block as ContentBlock);
        }
      }
    }

    // Extract tool calls if present in the response
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

  function _addErrorMessage(message: string): void {
    lastError.value = message;
    messages.value.push({
      id: crypto.randomUUID(),
      role: "error",
      content: message,
      error: {
        code: "REQUEST_FAILED",
        message,
      },
      timestamp: new Date(),
    });
    messages.value = [...messages.value];
  }

  function clearMessages(): void {
    messages.value = [];
    isLoading.value = false;
    lastError.value = null;
  }

  return {
    messages: readonly(messages),
    isLoading: readonly(isLoading),
    lastError: readonly(lastError),
    sendMessage,
    clearMessages,
  };
}
