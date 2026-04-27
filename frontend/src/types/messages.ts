/** Message and tool call types for the chat interface. */

import type { ContentBlock } from "./blocks";

export type MessageRole = "user" | "assistant" | "tool_call" | "error";

/**
 * A single part of an assistant message, preserving the arrival order of
 * plain-text tokens and structured content blocks.
 */
export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "block"; block: ContentBlock };

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
  /**
   * Ordered parts preserving the interleaved arrival of text tokens and
   * structured blocks. Populated only for SSE-streamed assistant messages.
   * MessageBubble renders parts when present; falls back to legacy
   * content+blocks rendering for older / fallback messages.
   */
  parts?: MessagePart[];
  toolCall?: ToolCall;
  error?: ErrorInfo;
  /**
   * Set to null on creation of SSE assistant placeholders; assigned a
   * real Date at the `done` event so the timestamp reflects when the
   * response finished streaming, not when it started.
   */
  timestamp: Date | null;
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
