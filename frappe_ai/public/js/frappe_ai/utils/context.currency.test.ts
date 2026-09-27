import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPageContext } from "./context";

const g = globalThis as Record<string, unknown>;

/** The desk with one document open: the route names it, locals holds it, cur_frm points at it (form.js:407,415). */
function openDocument(doc: { doctype: string; name: string; currency?: string }) {
	g.frappe = {
		boot: { sysdefaults: { currency: "INR" } },
		router: { current_route: ["Form", doc.doctype, doc.name] },
		get_doc: () => doc,
	};
	g.cur_frm = { doctype: doc.doctype, docname: doc.name, doc };
}

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
		openDocument({ doctype: "Sales Invoice", name: "SINV-001", currency: "USD" });
		expect(getPageContext().currency).toBe("USD");
	});

	it("sends no currency when the open document has none, so the server can use the company's", () => {
		// frappe.boot.sysdefaults is the site-wide default, not the user's company's: sending it here
		// would hide the company's currency from the server, which is the only place that can read it.
		openDocument({ doctype: "Item", name: "ITEM-0001" });
		expect(getPageContext().currency).toBe("");
	});

	it("sends no currency on a page with no document", () => {
		g.frappe = {
			boot: { sysdefaults: { currency: "INR" } },
			defaults: { get_default: (key: string) => (key === "currency" ? "INR" : null) },
			router: { current_route: ["Workspaces", "Home"] },
		};
		g.cur_frm = undefined;
		expect(getPageContext().currency).toBe("");
	});
});
