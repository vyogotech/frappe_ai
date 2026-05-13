/** Message and tool call types for the chat interface. */

import type { ContentBlock } from "./blocks";

export type MessageRole = "user" | "assistant" | "tool_call" | "error";

export interface ToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  /**
   * The relay currently emits tool calls already in "done" state with no
   * separate result event. The other statuses are kept as a forward-compat
   * surface for when the agent starts streaming running/error/cancelled
   * lifecycle chunks.
   */
  status: "running" | "done" | "error" | "cancelled";
  result?: string;
  success?: boolean;
  timestamp?: Date;
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
  /**
   * Set to null on creation of streamed assistant placeholders; assigned a
   * real Date at the `done` event so the timestamp reflects when the
   * response finished streaming, not when it started.
   */
  timestamp: Date | null;
  /**
   * True while the assistant placeholder is waiting for content.
   * Flipped to false on first content chunk, `done`, error, or abort.
   * Used by MessageBubble to render the in-bubble "Thinking…" pulse.
   */
  pending?: boolean;
}
