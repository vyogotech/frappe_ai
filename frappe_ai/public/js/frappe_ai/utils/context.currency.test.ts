import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPageContext } from "./context";

const g = globalThis as Record<string, unknown>;

describe("getPageContext currency", () => {
	let originalFrappe: unknown;
	let originalCurFrm: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
		originalCurFrm = g.cur_frm;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
		g.cur_frm = originalCurFrm;
	});

	it("sends the open document's own currency", () => {
		g.frappe = { boot: { sysdefaults: { currency: "INR" } } };
		g.cur_frm = { doc: { doctype: "Sales Invoice", name: "SINV-001", currency: "USD" } };
		expect(getPageContext().currency).toBe("USD");
	});

	it("sends no currency when the open document has none, so the server can use the company's", () => {
		// frappe.boot.sysdefaults is the site-wide default, not the user's company's: sending it here
		// would hide the company's currency from the server, which is the only place that can read it.
		g.frappe = { boot: { sysdefaults: { currency: "INR" } } };
		g.cur_frm = { doc: { doctype: "Item", name: "ITEM-0001" } };
		expect(getPageContext().currency).toBe("");
	});

	it("sends no currency on a page with no document", () => {
		g.frappe = {
			boot: { sysdefaults: { currency: "INR" } },
			defaults: { get_default: (key: string) => (key === "currency" ? "INR" : null) },
		};
		g.cur_frm = undefined;
		expect(getPageContext().currency).toBe("");
	});
});
