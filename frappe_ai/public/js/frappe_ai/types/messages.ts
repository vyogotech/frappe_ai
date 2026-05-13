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

/**
 * Ordered fragments of a streaming assistant reply. The agent emits
 * text and content_block chunks interleaved in temporal order — a flat
 * `content` string + parallel `blocks[]` discards that ordering and
 * makes the renderer always show all text before all blocks, which
 * looks like the stream "jumping" when a late text chunk lands above
 * an already-rendered block. Tracking parts in arrival order keeps
 * the visible layout faithful to the agent's actual sequence.
 */
export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "block"; block: ContentBlock };

export interface AssistantMessage extends MessageBase {
  role: "assistant";
  /**
   * Concatenation of all text fragments. Kept alongside `parts` for
   * hydrated messages (loadRecentConversation only restores `content`
   * — block fragments aren't persisted) and for places that need the
   * plain-text body without walking the parts array.
   */
  content: string;
  /**
   * All block fragments in arrival order. Same rationale as `content`:
   * legacy accessors keep working, new code reads `parts` for the
   * interleaved order.
   */
  blocks?: ContentBlock[];
  /**
   * Ordered sequence of text/block fragments as they arrived from the
   * stream. Absent on hydrated rows (they only have `content`); the
   * renderer falls back to `content` + `blocks` in that case.
   */
  parts?: MessagePart[];
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
