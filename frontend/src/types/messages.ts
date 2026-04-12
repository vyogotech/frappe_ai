/** Message and tool call types for the chat interface. */

import type { ContentBlock } from "./blocks";

export type MessageRole = "user" | "assistant" | "tool_call" | "error";

export interface ToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  success?: boolean;
  status: "running" | "done" | "error";
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
}
