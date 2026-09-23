/** Extract current page context from Frappe globals. */

export interface PageContext {
	route: string;
	doctype: string;
	docname: string;
	currency: string;
}

export function getPageContext(): PageContext {
	const ctx: PageContext = {
		route: "",
		doctype: "",
		docname: "",
		currency: "",
	};

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

		// the open document's own currency only: frappe.boot.sysdefaults holds the site-wide default, not the
		// user's company's, and sending it here would hide the company's from the server, which fills this in
		const currency = typeof cur_frm !== "undefined" ? cur_frm?.doc?.currency : undefined;
		if (typeof currency === "string") {
			ctx.currency = currency.toUpperCase();
		}
	} catch {
		// Silently fail in dev mode without frappe
	}

	return ctx;
}
