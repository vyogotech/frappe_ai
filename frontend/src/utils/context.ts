/** Extract current page context from Frappe globals. */

declare const frappe: any;
declare const cur_frm: any;
declare const cur_list: any;

export interface PageContext {
  route: string;
  doctype: string;
  docname: string;
  currency: string;
}

export function getPageContext(): PageContext {
  const ctx: PageContext = { route: "", doctype: "", docname: "", currency: "" };

  try {
    if (typeof frappe === "undefined") {
      return ctx;
    }

    const route = frappe?.router?.current_route;
    if (Array.isArray(route)) {
      ctx.route = route.join("/");
    }

    if (typeof cur_frm !== "undefined" && cur_frm?.doc) {
      ctx.doctype = cur_frm.doc.doctype || "";
      ctx.docname = cur_frm.doc.name || "";
    } else if (typeof cur_list !== "undefined" && cur_list?.doctype) {
      ctx.doctype = cur_list.doctype;
    }

    // Currency: derived in priority order from
    //   1. the bound document (if it carries a `currency` field, e.g.
    //      Sales Invoice, Purchase Order — most accurate per-document)
    //   2. the system default (Company.default_currency, exposed via
    //      frappe.boot.sysdefaults)
    //   3. frappe.defaults.get_default — older Frappe versions
    // The agent uses this to render prose currency consistently with the
    // table/kpi cell formatter (which also defaults to INR).
    let currency = "";
    if (typeof cur_frm !== "undefined" && cur_frm?.doc?.currency) {
      currency = cur_frm.doc.currency;
    } else if (frappe?.boot?.sysdefaults?.currency) {
      currency = frappe.boot.sysdefaults.currency;
    } else if (frappe?.defaults?.get_default) {
      currency = frappe.defaults.get_default("currency") || "";
    }
    if (typeof currency === "string") {
      ctx.currency = currency.toUpperCase();
    }
  } catch {
    // Silently fail in dev mode without frappe
  }

  return ctx;
}
