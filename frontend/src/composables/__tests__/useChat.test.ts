import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { mockSSEFetch } from "./_mock-sse";
import { useChat, setAgentUrl } from "../useChat";

const AGENT_URL = "http://localhost:9999";

beforeEach(() => {
  setAgentUrl(AGENT_URL);
  (globalThis as any).frappe = { session: { user: "test@example.com" } };
});

afterEach(() => {
  vi.restoreAllMocks();
  setAgentUrl("");
});

/** Wait for all queued microtasks to drain. */
async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

describe("useChat — placeholder pending lifecycle", () => {
  it("marks the assistant placeholder as pending until the first content chunk arrives", async () => {
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("hi");
    await flush();

    // placeholder created immediately
    const placeholder = chat.messages.value.find((m) => m.role === "assistant");
    expect(placeholder).toBeDefined();
    expect(placeholder!.pending).toBe(true);
    expect(placeholder!.content).toBe("");

    // status event alone doesn't clear pending
    emit({ type: "status", message: "Thinking" });
    await flush();
    const afterStatus = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(afterStatus.pending).toBe(true);
    expect(afterStatus.metadata?.statusText).toBe("Thinking");

    // first content chunk clears pending
    emit({ type: "content", text: "Hello" });
    await flush();
    const afterContent = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(afterContent.pending).toBe(false);
    expect(afterContent.content).toBe("Hello");

    finish();
    await flush();
  });

  it("clears pending on `done` even when no content chunks arrived", async () => {
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("run a tool and say nothing");
    await flush();

    emit({ type: "status", message: "Thinking" });
    emit({ type: "done" });
    finish();
    await flush();

    const placeholder = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(placeholder.pending).toBe(false);
    expect(placeholder.metadata?.statusText).toBeUndefined();
    expect(chat.isLoading.value).toBe(false);
  });

  it("cancelMessage with no content streamed removes the placeholder and leaves no error", async () => {
    const { fetchMock, emit } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("hi");
    await flush();

    emit({ type: "status", message: "Thinking" });
    await flush();
    expect(chat.messages.value.some((m) => m.role === "assistant")).toBe(true);

    chat.cancelMessage();
    await flush();

    // User message stays; placeholder gone; no error bubble added.
    expect(chat.messages.value.map((m) => m.role)).toEqual(["user"]);
    expect(chat.isLoading.value).toBe(false);
    expect(chat.lastError.value).toBeNull();
  });

  it("cancelMessage mid-stream keeps partial content and clears pending", async () => {
    const { fetchMock, emit } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("hi");
    await flush();

    emit({ type: "content", text: "Partial " });
    emit({ type: "content", text: "answer" });
    await flush();

    chat.cancelMessage();
    await flush();

    const assistants = chat.messages.value.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe("Partial answer");
    expect(assistants[0].pending).toBe(false);
    expect(chat.isLoading.value).toBe(false);
  });

  it("cancelMessage marks any running tool_call as cancelled", async () => {
    const { fetchMock, emit } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("update a doc");
    await flush();

    emit({ type: "tool_call", name: "update_document", arguments: {} });
    await flush();

    chat.cancelMessage();
    await flush();

    const toolMsgs = chat.messages.value.filter((m) => m.role === "tool_call");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].toolCall?.status).toBe("cancelled");
  });

  it("is safe when cancelMessage fires between the last content and done", async () => {
    // Spec §199-201 flagged this race: the user may click Stop in the
    // small window between the final content event and the done event.
    // Both the abort and the done handler touch the placeholder. The
    // final state must be consistent (pending=false, content preserved,
    // no error bubble, isLoading=false) regardless of ordering.
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("hi");
    await flush();

    emit({ type: "content", text: "Almost done" });
    await flush();

    // Fire the abort first — the fetch loop is still awaiting the next
    // read, which will reject with AbortError and enter the catch block.
    chat.cancelMessage();

    // The mock doesn't deliver events after abort (the read promise has
    // been rejected). Emitting `done` here is a no-op at the transport
    // layer — it would be dropped by the reader. Calling finish() also
    // a no-op (stream already in the abort path).
    emit({ type: "done" });
    finish();
    await flush();

    const assistants = chat.messages.value.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe("Almost done");
    expect(assistants[0].pending).toBe(false);
    expect(chat.isLoading.value).toBe(false);
    expect(chat.canCancel.value).toBe(false);
    expect(chat.lastError.value).toBeNull();
    // No error bubble from either path.
    expect(
      chat.messages.value.some((m) => m.role === "error"),
    ).toBe(false);
  });

  it("canCancel is true only while the SSE request is in flight", async () => {
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    expect(chat.canCancel.value).toBe(false);

    chat.sendMessage("hi");
    await flush();
    expect(chat.canCancel.value).toBe(true);

    emit({ type: "content", text: "done" });
    emit({ type: "done" });
    finish();
    await flush();

    expect(chat.canCancel.value).toBe(false);
  });
});

describe("useChat — Fix 3a: timestamp set at done, not creation", () => {
  it("timestamp is null while streaming and set after done", async () => {
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("hi");
    await flush();

    // Placeholder should have null timestamp while still pending
    const placeholder = chat.messages.value.find((m) => m.role === "assistant");
    expect(placeholder).toBeDefined();
    expect(placeholder!.timestamp).toBeNull();

    emit({ type: "content", text: "Hello" });
    await flush();

    // Still null while streaming (not done yet)
    const streaming = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(streaming.timestamp).toBeNull();

    emit({ type: "done" });
    finish();
    await flush();

    // Now has a real timestamp
    const done = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(done.timestamp).toBeInstanceOf(Date);
  });
});

describe("useChat — Fix 3b: parts array preserves arrival order", () => {
  it("builds parts with interleaved text and block kinds in arrival order", async () => {
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("show me data");
    await flush();

    const tableBlock = {
      type: "table",
      columns: [{ key: "id", label: "ID" }],
      rows: [{ values: { id: 1 } }],
    };
    const chartBlock = {
      type: "chart",
      chart_type: "bar",
      data: { labels: ["A"], datasets: [{ name: "S", values: [1] }] },
    };

    emit({ type: "content", text: "Here is the table:" });
    await flush();
    emit({ type: "content_block", block: tableBlock });
    await flush();
    emit({ type: "content", text: "And a chart:" });
    await flush();
    emit({ type: "content_block", block: chartBlock });
    await flush();
    emit({ type: "content", text: "Done." });
    await flush();

    emit({ type: "done" });
    finish();
    await flush();

    const assistant = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(assistant.parts).toBeDefined();
    expect(assistant.parts!.length).toBe(5);

    // Check kinds in order: text, block, text, block, text
    expect(assistant.parts![0].kind).toBe("text");
    expect(assistant.parts![1].kind).toBe("block");
    expect(assistant.parts![2].kind).toBe("text");
    expect(assistant.parts![3].kind).toBe("block");
    expect(assistant.parts![4].kind).toBe("text");

    // Check text coalescing: consecutive text chunks merge into the same part
    // (all three text events here each happen between blocks so they're separate)
    if (assistant.parts![0].kind === "text") {
      expect(assistant.parts![0].text).toBe("Here is the table:");
    }
    if (assistant.parts![2].kind === "text") {
      expect(assistant.parts![2].text).toBe("And a chart:");
    }
    if (assistant.parts![4].kind === "text") {
      expect(assistant.parts![4].text).toBe("Done.");
    }
  });

  it("coalesces consecutive text tokens into the same text part", async () => {
    const { fetchMock, emit, finish } = mockSSEFetch();
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat();
    chat.sendMessage("tell me something");
    await flush();

    emit({ type: "content", text: "Hello " });
    await flush();
    emit({ type: "content", text: "world" });
    await flush();
    emit({ type: "content", text: "!" });
    await flush();

    emit({ type: "done" });
    finish();
    await flush();

    const assistant = chat.messages.value.find((m) => m.role === "assistant")!;
    expect(assistant.parts).toBeDefined();
    // Three consecutive text tokens should merge into a single part
    expect(assistant.parts!.length).toBe(1);
    expect(assistant.parts![0].kind).toBe("text");
    if (assistant.parts![0].kind === "text") {
      expect(assistant.parts![0].text).toBe("Hello world!");
    }
  });
});
