import { afterEach, describe, expect, it } from "vitest";
import { formatValue } from "./formatters";

// Helper: snapshot + restore frappe.boot.sysdefaults for the duration of a test.
function withBoot<T>(boot: Record<string, unknown> | undefined, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const original = (g.frappe as { boot?: unknown }).boot;
  (g.frappe as { boot?: unknown }).boot = boot;
  try {
    return fn();
  } finally {
    (g.frappe as { boot?: unknown }).boot = original;
  }
}

describe("formatValue", () => {
  afterEach(() => {
    // Each test cleans up after itself, but just in case.
    const g = globalThis as Record<string, unknown>;
    (g.frappe as { boot?: unknown }).boot = { sysdefaults: { currency: "INR" } };
  });

  it("returns em-dash for null and undefined", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue(undefined)).toBe("—");
  });

  it("stringifies values when no format is supplied", () => {
    expect(formatValue(42)).toBe("42");
    expect(formatValue("hello")).toBe("hello");
    expect(formatValue(true)).toBe("true");
    expect(formatValue(0)).toBe("0");
  });

  describe("currency", () => {
    it("uses supplied currency", () => {
      const out = formatValue(1234, "currency", { currency: "USD" });
      // en-IN locale grouping ('1,234') with $ symbol.
      expect(out).toMatch(/\$/);
      expect(out).toContain("1,234");
    });

    it("falls back to frappe.boot.sysdefaults.currency", () => {
      withBoot({ sysdefaults: { currency: "EUR" } }, () => {
        const out = formatValue(1234, "currency");
        expect(out).toContain("1,234");
        expect(out).toMatch(/€/);
      });
    });

    it("falls back to INR when no other source is available", () => {
      withBoot(undefined, () => {
        const out = formatValue(1234, "currency");
        // Currency code or symbol — Intl may render as '₹' or 'INR'.
        expect(out).toMatch(/₹|INR/);
      });
    });

    it("rounds to integer (no fractional digits)", () => {
      const out = formatValue(1234.567, "currency", { currency: "USD" });
      expect(out).toContain("1,235");
      expect(out).not.toMatch(/\.\d/);
    });
  });

  describe("number", () => {
    it("formats integers with en-IN grouping", () => {
      // en-IN groups in lakhs/crores: 12,34,567
      expect(formatValue(1234567, "number")).toBe("12,34,567");
    });

    it("formats small numbers without grouping", () => {
      expect(formatValue(42, "number")).toBe("42");
    });
  });

  describe("percent", () => {
    it("scales by 1/100 and renders with one decimal", () => {
      // The function divides the input by 100; 50 → 50% (Intl renders 0.5).
      const out = formatValue(50, "percent");
      expect(out).toContain("50.0");
      expect(out).toContain("%");
    });

    it("handles negative percentages", () => {
      expect(formatValue(-10, "percent")).toContain("%");
    });
  });

  describe("date", () => {
    it("renders ISO date strings", () => {
      const out = formatValue("2026-05-13", "date");
      // en-IN long format: "13 May 2026"
      expect(out).toContain("2026");
      expect(out).toContain("May");
    });
  });

  describe("unknown format", () => {
    it("falls back to String(value)", () => {
      expect(formatValue(42, "unknown-format-key")).toBe("42");
    });
  });
});
