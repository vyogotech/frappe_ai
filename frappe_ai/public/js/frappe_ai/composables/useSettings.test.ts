import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const g = globalThis as Record<string, unknown>;

describe("useSettings", () => {
  let originalFrappe: unknown;

  beforeEach(() => {
    originalFrappe = g.frappe;
    vi.resetModules(); // module-level singleton; reset between tests
  });

  afterEach(() => {
    g.frappe = originalFrappe;
  });

  it("starts with sensible defaults before load", async () => {
    g.frappe = {
      call: vi.fn(() => new Promise(() => {})), // never resolves
    };
    const { useSettings } = await import("./useSettings");
    const { settings } = useSettings();
    expect(settings.value).toEqual({
      enabled: false,
      sidebarWidth: 380,
      keyboardShortcut: "Alt+/",
    });
  });

  it("loads settings from the backend", async () => {
    const mockCall = vi.fn().mockResolvedValue({
      message: {
        enabled: true,
        sidebar_width: 420,
        keyboard_shortcut: "Mod+Shift+A",
      },
    });
    g.frappe = { call: mockCall };

    const { useSettings } = await import("./useSettings");
    const { settings, loadSettings } = useSettings();
    await loadSettings();

    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ method: "frappe_ai.api.get_settings" }),
    );
    expect(settings.value).toEqual({
      enabled: true,
      sidebarWidth: 420,
      keyboardShortcut: "Mod+Shift+A",
    });
  });

  it("falls back to defaults when response is empty", async () => {
    g.frappe = { call: vi.fn().mockResolvedValue({}) };
    const { useSettings } = await import("./useSettings");
    const { settings, loadSettings } = useSettings();
    await loadSettings();
    expect(settings.value).toEqual({
      enabled: false,
      sidebarWidth: 380,
      keyboardShortcut: "Alt+/",
    });
  });

  it("falls back to defaults when frappe is undefined", async () => {
    g.frappe = undefined;
    const { useSettings } = await import("./useSettings");
    const { settings, loaded, loadSettings } = useSettings();
    await loadSettings();
    expect(loaded.value).toBe(true);
    expect(settings.value.keyboardShortcut).toBe("Alt+/"); // not the reserved Ctrl+/
  });

  it("swallows network errors and falls back to defaults", async () => {
    g.frappe = { call: vi.fn().mockRejectedValue(new Error("boom")) };
    const { useSettings } = await import("./useSettings");
    const { settings, loaded, loadSettings } = useSettings();
    await loadSettings();
    expect(loaded.value).toBe(true);
    expect(settings.value).toEqual({
      enabled: false,
      sidebarWidth: 380,
      keyboardShortcut: "Alt+/",
    });
  });

  it("applies per-field fallback when response omits a key", async () => {
    g.frappe = {
      call: vi.fn().mockResolvedValue({
        message: { enabled: true /* no sidebar_width, no keyboard_shortcut */ },
      }),
    };
    const { useSettings } = await import("./useSettings");
    const { settings, loadSettings } = useSettings();
    await loadSettings();
    expect(settings.value.enabled).toBe(true);
    expect(settings.value.sidebarWidth).toBe(380);
    expect(settings.value.keyboardShortcut).toBe("Alt+/");
  });
});
