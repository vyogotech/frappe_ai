/** Message and tool call types for the chat interface. */

import type { ContentBlock } from "./blocks";

export type MessageRole = "user" | "assistant" | "tool_call" | "error";

export interface ToolCall {
	name: string;
	arguments: Record<string, unknown>;
	/** The relay sends a tool call already "done"; "waiting" is a write paused for the user (ADR-006). */
	status: "done" | "cancelled" | "waiting";
	/** Set on a paused write: the id an Allow or a Deny is posted back with, and all the browser holds of it. */
	confirm?: { id: string };
	timestamp?: Date;
}

export interface ErrorInfo {
	code: string;
	message: string;
	suggestion?: string;
}

interface MessageBase {
	id: string;
	/** null on a streaming placeholder until done, so it shows when the reply finished, not when it started. */
	timestamp: Date | null;
}

export interface UserMessage extends MessageBase {
	role: "user";
	content: string;
}

/** A streamed reply's text and blocks in arrival order, so text that comes late renders below the blocks before it. */
export type MessagePart = { kind: "text"; text: string } | { kind: "block"; block: ContentBlock };

export interface AssistantMessage extends MessageBase {
	role: "assistant";
	/** All text fragments joined; a restored message has only this, since blocks are not stored. */
	content: string;
	/** All block fragments in arrival order; parts has their order among the text. */
	blocks?: ContentBlock[];
	/** Absent on a restored message, where the renderer falls back to content and blocks. */
	parts?: MessagePart[];
	/** True until the first content chunk, done, an error or an abort; MessageBubble shows "Thinking…" meanwhile. */
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
