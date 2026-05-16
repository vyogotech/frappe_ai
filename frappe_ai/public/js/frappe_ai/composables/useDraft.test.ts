import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const g = globalThis as Record<string, unknown>;

function freshStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  } as Storage;
}

async function loadModule(user = "alice@example.com") {
  vi.resetModules();
  g.localStorage = freshStorage();
  g.frappe = { session: { user } };
  const mod = await import("./useDraft");
  return mod;
}

describe("useDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty draft when nothing saved", async () => {
    const { useDraft } = await loadModule();
    const draft = useDraft();
    expect(draft.load()).toBe("");
  });

  it("save then load roundtrip preserves text", async () => {
    const { useDraft } = await loadModule();
    const draft = useDraft();
    draft.save("hello world");
    vi.advanceTimersByTime(600); // flush the debounce
    expect(draft.load()).toBe("hello world");
  });

  it("clear removes the draft", async () => {
    const { useDraft } = await loadModule();
    const draft = useDraft();
    draft.save("draft to drop");
    vi.advanceTimersByTime(600);
    draft.clear();
    expect(draft.load()).toBe("");
  });

  it("drafts are scoped per user — alice cannot read bob's draft", async () => {
    const { useDraft: useDraftAlice } = await loadModule("alice@example.com");
    const aliceDraft = useDraftAlice();
    aliceDraft.save("alice secret");
    vi.advanceTimersByTime(600);
    // Same storage, different user
    g.frappe = { session: { user: "bob@example.com" } };
    vi.resetModules();
    const { useDraft: useDraftBob } = await import("./useDraft");
    expect(useDraftBob().load()).toBe("");
  });

  it("save is debounced — rapid calls coalesce", async () => {
    const { useDraft } = await loadModule();
    const draft = useDraft();
    const setItem = vi.spyOn(g.localStorage as Storage, "setItem");
    draft.save("a");
    draft.save("ab");
    draft.save("abc");
    draft.save("abcd");
    // No setItem call yet — still inside the debounce window.
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(draft.load()).toBe("abcd");
  });

  it("save with empty string clears the draft (no orphan)", async () => {
    const { useDraft } = await loadModule();
    const draft = useDraft();
    draft.save("temp");
    vi.advanceTimersByTime(600);
    draft.save("");
    vi.advanceTimersByTime(600);
    expect(draft.load()).toBe("");
  });

  it("works when frappe.session.user is unset (falls back to anon scope)", async () => {
    vi.resetModules();
    g.localStorage = freshStorage();
    g.frappe = {};
    const { useDraft } = await import("./useDraft");
    const draft = useDraft();
    draft.save("anonymous text");
    vi.advanceTimersByTime(600);
    expect(draft.load()).toBe("anonymous text");
  });
});
