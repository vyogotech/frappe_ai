import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantMessage, Message } from "../types/messages";

const g = globalThis as Record<string, unknown>;

/** Narrow a Message to its AssistantMessage variant in tests where we
 *  asserted the role on the line above. Throws if the runtime shape
 *  doesn't match, which is what we want — the test should fail loudly. */
function asAssistant(m: Message): AssistantMessage {
  if (m.role !== "assistant") throw new Error(`Expected assistant message, got ${m.role}`);
  return m;
}

interface CapturedListener {
  event: string;
  handler: (data: unknown) => void;
}

/** Helper: stand up a fresh useChat() with controllable frappe.call /
 *  realtime stubs. Returns the captured realtime listener + the chat
 *  composable for assertions. */
async function setup() {
  const listeners: CapturedListener[] = [];
  const startStreamCall = vi.fn(({ args }) => {
    // Returned promise resolves after the realtime listener is wired.
    return Promise.resolve({ message: { session_id: args.session_id } });
  });

  g.frappe = {
    call: vi.fn((opts: Record<string, unknown>) => {
      if (opts.method === "frappe_ai.api.chat.start_stream") {
        return startStreamCall(opts);
      }
      return Promise.resolve({ message: { session_id: null, messages: [] } });
    }),
    realtime: {
      on: vi.fn((event: string, handler: (data: unknown) => void) => {
        listeners.push({ event, handler });
      }),
      off: vi.fn(),
    },
  };

  vi.resetModules();
  const { useChat } = await import("./useChat");
  const chat = useChat();
  return { chat, listeners, startStreamCall };
}

function fireChunk(listeners: CapturedListener[], chunk: Record<string, unknown>) {
  // The most recently registered listener is the active stream.
  const last = listeners[listeners.length - 1];
  expect(last).toBeDefined();
  last.handler(chunk);
}

describe("useChat", () => {
  beforeEach(() => {
    // Speed up CLIENT_TIMEOUT_MS race in case a test forgets to settle.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores empty messages", async () => {
    const { chat } = await setup();
    await chat.sendMessage("");
    expect(chat.messages.value).toEqual([]);
  });

  it("ignores whitespace-only messages", async () => {
    const { chat } = await setup();
    await chat.sendMessage("   \n\t  ");
    expect(chat.messages.value).toEqual([]);
  });

  it("appends user + assistant placeholder on send", async () => {
    const { chat, listeners } = await setup();
    const promise = chat.sendMessage("hello");
    // Two messages now: user + pending assistant.
    expect(chat.messages.value).toHaveLength(2);
    expect(chat.messages.value[0].role).toBe("user");
    expect(chat.messages.value[0].content).toBe("hello");
    expect(chat.messages.value[1].role).toBe("assistant");
    expect(asAssistant(chat.messages.value[1]).pending).toBe(true);

    // Settle the stream so the test's awaited promise resolves.
    fireChunk(listeners, { type: "content", text: "hi back" });
    fireChunk(listeners, { type: "done", tools_called: [] });
    await promise;
  });

  it("accumulates content chunks into the assistant bubble", async () => {
    const { chat, listeners } = await setup();
    const promise = chat.sendMessage("hi");
    fireChunk(listeners, { type: "content", text: "Hello, " });
    fireChunk(listeners, { type: "content", text: "world." });
    fireChunk(listeners, { type: "done", tools_called: [] });
    await promise;
    const assistant = asAssistant(chat.messages.value[1]);
    expect(assistant.content).toBe("Hello, world.");
    expect(assistant.pending).toBe(false);
  });

  it("appends structured blocks to the assistant message", async () => {
    const { chat, listeners } = await setup();
    const promise = chat.sendMessage("show kpi");
    fireChunk(listeners, {
      type: "content_block",
      block: { type: "kpi", metrics: [{ label: "Revenue", value: 1000 }] },
    });
    fireChunk(listeners, { type: "done", tools_called: [] });
    await promise;
    const assistant = asAssistant(chat.messages.value[1]);
    expect(assistant.blocks).toHaveLength(1);
    expect(assistant.blocks?.[0].type).toBe("kpi");
  });

  it("splices a tool_call bubble BEFORE the assistant placeholder", async () => {
    // The agent emits tool_call before the content it summarises, so the
    // card must visually appear above the assistant bubble.
    const { chat, listeners } = await setup();
    const promise = chat.sendMessage("query");
    fireChunk(listeners, {
      type: "tool_call",
      name: "frappe.get_all",
      arguments: { doctype: "User" },
    });
    fireChunk(listeners, { type: "content", text: "Done." });
    fireChunk(listeners, { type: "done", tools_called: [] });
    await promise;
    // Order: [user, tool_call, assistant]
    expect(chat.messages.value).toHaveLength(3);
    expect(chat.messages.value[0].role).toBe("user");
    expect(chat.messages.value[1].role).toBe("tool_call");
    expect(chat.messages.value[2].role).toBe("assistant");
  });

  it("adopts agent-canonical session id from `session` chunk", async () => {
    const { chat, listeners } = await setup();
    const first = chat.sendMessage("first");
    fireChunk(listeners, { type: "session", id: "canonical-id-123" });
    fireChunk(listeners, { type: "content", text: "ok" });
    fireChunk(listeners, { type: "done", tools_called: [] });
    await first;

    // Next message should use the adopted id.
    const second = chat.sendMessage("second");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await second;
    const subscribedEvents = (
      g.frappe as { realtime: { on: { mock: { calls: unknown[][] } } } }
    ).realtime.on.mock.calls.map((c) => c[0] as string);
    // Both stream subscriptions must use canonical-id-123 (the second one
    // adopts it because _conversationId was set by the session chunk).
    expect(subscribedEvents).toContain("frappe_ai:chunk:canonical-id-123");
  });

  it("renders error message and clears the placeholder on `error` chunk", async () => {
    const { chat, listeners } = await setup();
    const promise = chat.sendMessage("trigger error");
    fireChunk(listeners, { type: "error", message: "Agent exploded" });
    await promise;
    const errMsg = chat.messages.value.find((m) => m.role === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg?.error?.message).toBe("Agent exploded");
    // Empty assistant placeholder must be removed.
    const stillPending = chat.messages.value.some(
      (m) => m.role === "assistant" && m.pending && !m.content,
    );
    expect(stillPending).toBe(false);
  });

  it("clearMessages wipes the bubble list and resets the conversation id", async () => {
    const { chat, listeners } = await setup();

    // First turn — subscribes to a fresh UUID-1.
    const first = chat.sendMessage("first");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await first;

    // Second turn (no clear) — must reuse the same _conversationId so
    // the agent's LangGraph checkpointer threads correctly. Subscribes
    // to UUID-1 again.
    const second = chat.sendMessage("second");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await second;

    // clearMessages drops _conversationId. Third turn mints UUID-2.
    chat.clearMessages();
    expect(chat.messages.value).toEqual([]);
    const third = chat.sendMessage("third");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await third;

    const events = (
      g.frappe as { realtime: { on: { mock: { calls: unknown[][] } } } }
    ).realtime.on.mock.calls.map((c) => c[0] as string);
    // First two turns share an event name; the third (post-clear) differs.
    expect(events[0]).toBe(events[1]);
    expect(events[2]).not.toBe(events[0]);
  });

  it("cancelMessage settles the stream without throwing", async () => {
    const { chat } = await setup();
    const promise = chat.sendMessage("hi");
    expect(chat.canCancel.value).toBe(true);
    chat.cancelMessage();
    await promise; // resolves cleanly
    expect(chat.isLoading.value).toBe(false);
    expect(chat.canCancel.value).toBe(false);
  });

  it("CLIENT_TIMEOUT_MS triggers a typed error when the relay never settles", async () => {
    const { chat } = await setup();
    const promise = chat.sendMessage("hang");
    vi.advanceTimersByTime(61_000);
    await promise; // settles via catch → _addErrorMessage
    const errMsg = chat.messages.value.find((m) => m.role === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg?.error?.code).toBe("REQUEST_FAILED");
    expect(errMsg?.error?.message).toMatch(/timed out/i);
  });
});
