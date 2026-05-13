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

  it("reads doctype + docname from cur_frm", () => {
    setFrappe({});
    setCurFrm({ doc: { doctype: "Sales Invoice", name: "SINV-001" } });
    const ctx = getPageContext();
    expect(ctx.doctype).toBe("Sales Invoice");
    expect(ctx.docname).toBe("SINV-001");
  });

  it("falls back to cur_list.doctype when no form is open", () => {
    setFrappe({});
    setCurFrm(undefined);
    setCurList({ doctype: "Item" });
    expect(getPageContext().doctype).toBe("Item");
  });

  it("prefers cur_frm currency when present", () => {
    setFrappe({ boot: { sysdefaults: { currency: "INR" } } });
    setCurFrm({ doc: { doctype: "SI", name: "X", currency: "USD" } });
    expect(getPageContext().currency).toBe("USD");
  });

  it("falls back to sysdefaults currency when cur_frm has none", () => {
    setFrappe({ boot: { sysdefaults: { currency: "EUR" } } });
    setCurFrm({ doc: { doctype: "SI", name: "X" } });
    expect(getPageContext().currency).toBe("EUR");
  });

  it("falls back to frappe.defaults.get_default('currency') as last resort", () => {
    setFrappe({
      boot: {},
      defaults: { get_default: (key: string) => (key === "currency" ? "GBP" : null) },
    });
    setCurFrm(undefined);
    expect(getPageContext().currency).toBe("GBP");
  });

  it("uppercases the currency code", () => {
    setFrappe({ boot: { sysdefaults: { currency: "inr" } } });
    expect(getPageContext().currency).toBe("INR");
  });

  it("treats malformed cur_frm gracefully", () => {
    setFrappe({});
    setCurFrm({ doc: null });
    expect(getPageContext().doctype).toBe("");
    expect(getPageContext().docname).toBe("");
  });

  it("never throws even when every global is malformed", () => {
    setFrappe({ router: null, boot: null, defaults: null });
    setCurFrm({ doc: { /* missing fields */ } });
    setCurList({ /* no doctype */ });
    expect(() => getPageContext()).not.toThrow();
  });
});
