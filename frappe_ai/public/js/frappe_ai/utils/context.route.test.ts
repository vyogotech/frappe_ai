import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPageContext } from "./context";

const g = globalThis as Record<string, unknown>;

const invoice = { doctype: "Sales Invoice", name: "SINV-001", currency: "USD" };

/** The desk after that invoice was opened: frappe assigns cur_frm once (form.js:407) and no route but a Page clears it. */
function deskAfterOpening(current_route: string[]) {
	g.frappe = {
		boot: { sysdefaults: { currency: "INR" } },
		router: { current_route },
		get_doc: (doctype: string, name: string) =>
			doctype === invoice.doctype && name === invoice.name ? invoice : null,
	};
	g.cur_frm = { doctype: invoice.doctype, docname: invoice.name, doc: invoice };
}

describe("getPageContext follows the route", () => {
	let originalFrappe: unknown;
	let originalCurFrm: unknown;
	let originalCurList: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
		originalCurFrm = g.cur_frm;
		originalCurList = g.cur_list;
	});

	afterEach(() => {
		g.frappe = originalFrappe;
		g.cur_frm = originalCurFrm;
		g.cur_list = originalCurList;
	});

	it("reports the document the route names", () => {
		deskAfterOpening(["Form", "Sales Invoice", "SINV-001"]);
		expect(getPageContext()).toEqual({
			route: "Form/Sales Invoice/SINV-001",
			doctype: "Sales Invoice",
			docname: "SINV-001",
			currency: "USD",
		});
	});

	it("keeps a docname that contains a slash whole", () => {
		g.frappe = { router: { current_route: ["Form", "File", "home/attachments"] } };
		expect(getPageContext().docname).toBe("home/attachments");
	});

	it("reports the list, not the form left behind, once the route is a list", () => {
		deskAfterOpening(["List", "Item", "List"]);
		g.cur_list = { doctype: "Item" };
		expect(getPageContext()).toEqual({
			route: "List/Item/List",
			doctype: "Item",
			docname: "",
			currency: "",
		});
	});

	it("reports no document on a page that has none", () => {
		deskAfterOpening(["Workspaces", "Home"]);
		g.cur_list = { doctype: "Item" };
		expect(getPageContext()).toEqual({
			route: "Workspaces/Home",
			doctype: "",
			docname: "",
			currency: "",
		});
	});
});
