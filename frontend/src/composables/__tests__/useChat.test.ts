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
