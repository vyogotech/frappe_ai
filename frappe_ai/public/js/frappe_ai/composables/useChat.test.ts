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
    // the agent groups both turns under the same AI Chat Session and
    // its FrappeHistoryClient can replay turn 1 into the LLM context.
    // Subscribes to UUID-1 again.
    const second = chat.sendMessage("second");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await second;

    // clearMessages drops _conversationId. Third turn mints UUID-2.
    chat.clearMessages();
    expect(chat.messages.value).toEqual([]);
    const third = chat.sendMessage("third");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await third;

    const chunkEvents = (
      g.frappe as { realtime: { on: { mock: { calls: unknown[][] } } } }
    ).realtime.on.mock.calls
      .map((c) => c[0] as string)
      .filter((ev) => ev.startsWith("frappe_ai:chunk:"));
    // First two turns share an event name; the third (post-clear) differs.
    expect(chunkEvents[0]).toBe(chunkEvents[1]);
    expect(chunkEvents[2]).not.toBe(chunkEvents[0]);
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

  it("extracts the Frappe ValidationError message instead of rendering [object Object]", async () => {
    // BUG-012 regression: Frappe rejects a `frappe.call` with a plain object
    // shaped like { exc_type, _server_messages, exception, ... }. The pre-fix
    // error handler did `new Error(String(err))`, which produced the literal
    // string "[object Object]" as the user-visible bubble.
    const listeners: CapturedListener[] = [];
    g.frappe = {
      call: vi.fn((opts: Record<string, unknown>) => {
        if (opts.method === "frappe_ai.api.chat.start_stream") {
          // Simulate Frappe's typical error response shape.
          const errPayload = {
            exc_type: "ValidationError",
            _server_messages: JSON.stringify([
              JSON.stringify({ message: "Message too long (max 10000 characters).", indicator: "red" }),
            ]),
            exception: "frappe.exceptions.ValidationError: Message too long (max 10000 characters).",
          };
          (opts as { error: (err: unknown) => void }).error(errPayload);
          return Promise.resolve();
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

    await chat.sendMessage("a".repeat(10001));

    const errMsg = chat.messages.value.find((m) => m.role === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg?.error?.message).toBe("Message too long (max 10000 characters).");
    expect(errMsg?.error?.message).not.toBe("[object Object]");
  });

  it("clearMessages cancels an in-flight stream and unsubscribes its listener", async () => {
    // BUG-009 / OBS-006 regression: pre-fix, clearMessages() emptied
    // messages.value but did NOT call cancelMessage() / frappe.realtime.off().
    // The orphan listener stayed alive and could intercept stray events.
    // Worse, the in-flight stream's _resolveStream / settled state was not
    // reset, so a subsequent sendMessage entered with isLoading already
    // momentarily true via timing artifacts.
    const { chat, listeners } = await setup();
    const firstSend = chat.sendMessage("first");
    expect(chat.isLoading.value).toBe(true);

    // Capture which event was subscribed.
    const offSpy = (g.frappe as { realtime: { off: { mock: { calls: unknown[][] } } } })
      .realtime.off;
    const onCallsBefore = (
      g.frappe as { realtime: { on: { mock: { calls: unknown[][] } } } }
    ).realtime.on.mock.calls.length;
    const firstEvent = listeners[onCallsBefore - 1].event;

    chat.clearMessages();

    // clearMessages must have called realtime.off for the in-flight stream.
    const offCalls = offSpy.mock.calls.map((c) => c[0] as string);
    expect(offCalls).toContain(firstEvent);

    // isLoading must be reset so a follow-up sendMessage can proceed.
    expect(chat.isLoading.value).toBe(false);

    // The first sendMessage's promise should settle without throwing.
    await firstSend;
  });

  it("appends an inbound msg_added event for the active conversation when idle", async () => {
    // BUG-004 regression: a second tab opened on the same session never sees
    // messages sent in the first tab. Fix: server publishes
    // frappe_ai:msg_added on every new AI Chat Message; client appends if the
    // session matches and the message isn't already shown.
    const { chat, listeners } = await setup();

    // First turn — establishes _conversationId and the realtime subscription.
    // The setup() helper has start_stream resolve with session_id=null which
    // means the optimistic UUID stays; we just need _conversationId set.
    const first = chat.sendMessage("hello");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await first;

    const initialCount = chat.messages.value.length;
    const chunkCall = (
      g.frappe as { realtime: { on: { mock: { calls: unknown[][] } } } }
    ).realtime.on.mock.calls.find((c) =>
      typeof c[0] === "string" && (c[0] as string).startsWith("frappe_ai:chunk:"),
    );
    const sessionId = (chunkCall![0] as string).replace("frappe_ai:chunk:", "");

    // Simulate the global "msg_added" listener firing — a message saved by
    // another tab arrives here while this tab is idle.
    const msgAddedListener = listeners.find((l) => l.event === "frappe_ai:msg_added");
    expect(msgAddedListener).toBeDefined();
    msgAddedListener!.handler({
      session_id: sessionId,
      id: "server-msg-from-other-tab",
      role: "user",
      content: "ping from tab A",
      timestamp: "2026-05-16T17:12:35Z",
    });

    expect(chat.messages.value.length).toBe(initialCount + 1);
    const newMsg = chat.messages.value[chat.messages.value.length - 1];
    expect(newMsg.id).toBe("server-msg-from-other-tab");
    expect(newMsg.content).toBe("ping from tab A");
  });

  it("ignores msg_added for a different session_id", async () => {
    const { chat, listeners } = await setup();
    const first = chat.sendMessage("hi");
    fireChunk(listeners, { type: "done", tools_called: [] });
    await first;

    const before = chat.messages.value.length;
    const msgAddedListener = listeners.find((l) => l.event === "frappe_ai:msg_added");
    msgAddedListener!.handler({
      session_id: "unrelated-other-session",
      id: "unrelated-msg",
      role: "user",
      content: "from a different conversation",
      timestamp: "2026-05-16T17:12:35Z",
    });
    expect(chat.messages.value.length).toBe(before);
  });

  it("ignores msg_added while a stream is in flight (avoids duplicating own messages)", async () => {
    const { chat, listeners } = await setup();
    const sending = chat.sendMessage("first message"); // does not auto-settle

    expect(chat.isLoading.value).toBe(true);
    const before = chat.messages.value.length;

    // While loading, an msg_added arrives for the same session — must skip.
    const chunkCall2 = (
      g.frappe as { realtime: { on: { mock: { calls: unknown[][] } } } }
    ).realtime.on.mock.calls.find((c) =>
      typeof c[0] === "string" && (c[0] as string).startsWith("frappe_ai:chunk:"),
    );
    const sessionId = (chunkCall2![0] as string).replace("frappe_ai:chunk:", "");
    const msgAddedListener = listeners.find((l) => l.event === "frappe_ai:msg_added");
    msgAddedListener!.handler({
      session_id: sessionId,
      id: "would-be-dupe",
      role: "user",
      content: "first message",
      timestamp: "2026-05-16T17:12:35Z",
    });
    expect(chat.messages.value.length).toBe(before);

    // settle and let the test exit cleanly.
    fireChunk(listeners, { type: "done", tools_called: [] });
    await sending;
  });

  it("CLIENT_TIMEOUT_MS triggers a typed error when the relay never settles", async () => {
    const { chat } = await setup();
    const promise = chat.sendMessage("hang");
    // CLIENT_TIMEOUT_MS is 120_000; advance just past it.
    vi.advanceTimersByTime(121_000);
    await promise; // settles via catch → _addErrorMessage
    const errMsg = chat.messages.value.find((m) => m.role === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg?.error?.code).toBe("REQUEST_FAILED");
    expect(errMsg?.error?.message).toMatch(/timed out/i);
  });
});
