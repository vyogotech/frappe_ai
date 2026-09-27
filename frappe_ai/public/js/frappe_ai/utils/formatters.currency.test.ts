import { afterEach, describe, expect, it } from "vitest";
import { formatValue, setAgentCurrency } from "./formatters";

describe("formatValue with the currency the agent was given", () => {
	afterEach(() => {
		setAgentCurrency("");
	});

	it("formats amounts in the currency the server sent to the agent", () => {
		setAgentCurrency("USD");
		const out = formatValue(1234, "currency");
		expect(out).toMatch(/\$/);
		expect(out).toContain("1,234");
	});

	it("prefers it over the site-wide default, which is not the company's currency", () => {
		// the stub in __tests__/setup.ts leaves frappe.boot.sysdefaults.currency as INR
		setAgentCurrency("EUR");
		expect(formatValue(1234, "currency")).toMatch(/€/);
	});

	it("still prefers a currency the block carries itself", () => {
		setAgentCurrency("EUR");
		expect(formatValue(1234, "currency", { currency: "USD" })).toMatch(/\$/);
	});

	it("renders a plain number when nothing names a currency", () => {
		const frappe = (globalThis as Record<string, unknown>).frappe as { boot?: unknown };
		const boot = frappe.boot;
		frappe.boot = undefined;
		try {
			expect(formatValue(1234, "currency")).toBe("1,234");
			expect(formatValue(1234.567, "currency")).toBe("1,235");
		} finally {
			frappe.boot = boot;
		}
	});
});
