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
});
