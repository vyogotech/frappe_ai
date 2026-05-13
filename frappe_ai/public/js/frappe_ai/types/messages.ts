/** Message and tool call types for the chat interface.
 *
 * `Message` is a discriminated union on `role` so the type system enforces
 * "tool_call rows have a toolCall payload" and "error rows have an error
 * payload" — previously soft contracts that drifted into runtime checks.
 */

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

/** Common fields every message carries regardless of role. */
interface MessageBase {
  id: string;
  /**
   * Set to null on creation of streamed assistant placeholders; assigned a
   * real Date at the `done` event so the timestamp reflects when the
   * response finished streaming, not when it started.
   */
  timestamp: Date | null;
}

export interface UserMessage extends MessageBase {
  role: "user";
  content: string;
}

export interface AssistantMessage extends MessageBase {
  role: "assistant";
  content: string;
  blocks?: ContentBlock[];
  /**
   * True while the placeholder is waiting for content. Flipped to false
   * on first content chunk, `done`, error, or abort. Used by MessageBubble
   * to render the in-bubble "Thinking…" pulse.
   */
  pending?: boolean;
}

export interface ToolCallMessage extends MessageBase {
  role: "tool_call";
  content: ""; // unused for this role — the renderer reads toolCall instead
  toolCall: ToolCall;
}

export interface ErrorMessage extends MessageBase {
  role: "error";
  content: string;
  error: ErrorInfo;
}

export type Message = UserMessage | AssistantMessage | ToolCallMessage | ErrorMessage;
