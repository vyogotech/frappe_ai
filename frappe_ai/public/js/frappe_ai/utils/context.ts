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
		if (!Array.isArray(route)) {
			return ctx;
		}
		ctx.route = route.join("/");

		// the route, never cur_frm or cur_list: frappe assigns cur_frm in one place (form.js:407) and clears
		// it only when a Page route shows, so on a list it still names the last form the user opened
		if (route[0] === "Form" && route[1]) {
			ctx.doctype = route[1];
			ctx.docname = route.slice(2).join("/");
			// the open document's own currency only: frappe.boot.sysdefaults holds the site-wide default, not the
			// user's company's, and sending it here would hide the company's from the server, which fills this in
			const currency = frappe.get_doc?.(ctx.doctype, ctx.docname)?.currency;
			if (typeof currency === "string") {
				ctx.currency = currency.toUpperCase();
			}
		} else if (route[0] === "List" && route[1]) {
			ctx.doctype = route[1];
		}
	} catch {
		// Silently fail in dev mode without frappe
	}

	return ctx;
}
