/** Message and tool call types for the chat interface. */

import type { ContentBlock } from "./blocks";

export type MessageRole = "user" | "assistant" | "tool_call" | "error";

export interface ToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  success?: boolean;
  status: "running" | "done" | "error" | "cancelled";
}

export interface ErrorInfo {
  code: string;
  message: string;
  suggestion?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  blocks?: ContentBlock[];
  toolCall?: ToolCall;
  error?: ErrorInfo;
  timestamp: Date;
  /**
   * True while the assistant placeholder is waiting for content.
   * Flipped to false on first content chunk, `done`, error, or abort.
   * Used by MessageBubble to render the in-bubble "Thinking…" /
   * contextual-status block.
   */
  pending?: boolean;
  /** SSE-only: transient metadata (thinking status, etc.) */
  metadata?: {
    statusText?: string;
  };
}
