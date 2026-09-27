import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPageContext } from "./context";

const g = globalThis as Record<string, unknown>;

function setFrappe(value: unknown) {
	g.frappe = value;
}
function setCurFrm(value: unknown) {
	g.cur_frm = value;
}
function setCurList(value: unknown) {
	g.cur_list = value;
}

/** The desk with one document open: the route names it, locals holds it, cur_frm points at it (form.js:407,415). */
function openDocument(
	doc: { doctype: string; name: string; currency?: string },
	rest: object = {},
) {
	setFrappe({
		...rest,
		router: { current_route: ["Form", doc.doctype, doc.name] },
		get_doc: (doctype: string, name: string) =>
			doctype === doc.doctype && name === doc.name ? doc : null,
	});
	setCurFrm({ doctype: doc.doctype, docname: doc.name, doc });
}

describe("getPageContext", () => {
	let originalFrappe: unknown;
	let originalCurFrm: unknown;
	let originalCurList: unknown;

	beforeEach(() => {
		originalFrappe = g.frappe;
		originalCurFrm = g.cur_frm;
		originalCurList = g.cur_list;
	});

	afterEach(() => {
		setFrappe(originalFrappe);
		setCurFrm(originalCurFrm);
		setCurList(originalCurList);
	});

	it("returns an empty context when frappe is undefined", () => {
		setFrappe(undefined);
		setCurFrm(undefined);
		setCurList(undefined);
		expect(getPageContext()).toEqual({ route: "", doctype: "", docname: "", currency: "" });
	});

	it("derives route from frappe.router.current_route", () => {
		setFrappe({ router: { current_route: ["app", "user", "Administrator"] } });
		expect(getPageContext().route).toBe("app/user/Administrator");
	});

	it("ignores non-array route", () => {
		setFrappe({ router: { current_route: "not-an-array" } });
		expect(getPageContext().route).toBe("");
	});

	it("reads doctype + docname from the open document", () => {
		openDocument({ doctype: "Sales Invoice", name: "SINV-001" });
		const ctx = getPageContext();
		expect(ctx.doctype).toBe("Sales Invoice");
		expect(ctx.docname).toBe("SINV-001");
	});

	it("falls back to the list's doctype when no document is open", () => {
		setFrappe({ router: { current_route: ["List", "Item", "List"] } });
		setCurFrm(undefined);
		setCurList({ doctype: "Item" });
		expect(getPageContext().doctype).toBe("Item");
	});

	it("prefers the open document's currency over the site default", () => {
		openDocument(
			{ doctype: "SI", name: "X", currency: "USD" },
			{ boot: { sysdefaults: { currency: "INR" } } },
		);
		expect(getPageContext().currency).toBe("USD");
	});

	it("uppercases the currency code", () => {
		openDocument({ doctype: "SI", name: "X", currency: "inr" });
		expect(getPageContext().currency).toBe("INR");
	});

	it("treats a malformed desk state gracefully", () => {
		setFrappe({});
		setCurFrm({ doc: null });
		expect(getPageContext().doctype).toBe("");
		expect(getPageContext().docname).toBe("");
	});

	it("never throws even when every global is malformed", () => {
		setFrappe({ router: null, boot: null, defaults: null });
		setCurFrm({ doc: {/* missing fields */} });
		setCurList({/* no doctype */});
		expect(() => getPageContext()).not.toThrow();
	});
});
