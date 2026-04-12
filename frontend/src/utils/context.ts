/** Extract current page context from Frappe globals. */

declare const frappe: any;
declare const cur_frm: any;
declare const cur_list: any;

export interface PageContext {
  route: string;
  doctype: string;
  docname: string;
}

export function getPageContext(): PageContext {
  const ctx: PageContext = { route: "", doctype: "", docname: "" };

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
  } catch {
    // Silently fail in dev mode without frappe
  }

  return ctx;
}
