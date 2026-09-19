import { expect, it, vi } from "vitest";

// Frappe refuses a POST without its CSRF token, and sendBeacon cannot set a header, so the token rides in the body
it("sends the CSRF token with the cancel beacon when the tab closes mid-stream", async () => {
  (globalThis as Record<string, unknown>).frappe = {
    csrf_token: "the-token",
    call: vi.fn(() => new Promise(() => {})),
    realtime: { on: vi.fn(), off: vi.fn() },
  };
  const beacon = vi.fn(() => true);
  Object.defineProperty(navigator, "sendBeacon", {
    value: beacon,
    configurable: true,
  });
  const { useChat } = await import("./useChat");

  void useChat().sendMessage("hi");
  window.dispatchEvent(new Event("beforeunload"));

  const [url, body] = beacon.mock.calls[0] as unknown as [string, Blob];
  expect(url).toBe("/api/method/frappe_ai.api.chat.cancel_stream");
  const sent = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(body);
  });
  expect(JSON.parse(sent)).toMatchObject({ csrf_token: "the-token" });
});
