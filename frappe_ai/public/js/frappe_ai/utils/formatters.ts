/** Value formatting for block components. */

type FormatOptions = {
	currency?: string;
};

let agentCurrency = "";

/** The currency the server told the agent to answer in; the blocks it sends back carry none of their own. */
export function setAgentCurrency(code: string): void {
	agentCurrency = code;
}

/** The block's own currency, else the one the server gave the agent, else the site default, else "" — never a guess. */
function resolveCurrency(supplied?: string): string {
	if (supplied) return supplied;
	if (agentCurrency) return agentCurrency;
	try {
		if (typeof frappe !== "undefined") {
			const sys = frappe?.boot?.sysdefaults?.currency;
			if (sys) return sys;
			if (frappe?.defaults?.get_default) {
				const def = frappe.defaults.get_default("currency");
				if (def) return def;
			}
		}
	} catch {
		// ignore — nothing names a currency
	}
	return "";
}

export function formatValue(value: unknown, format?: string, options: FormatOptions = {}): string {
	if (value === null || value === undefined) {
		return "—";
	}

	switch (format) {
		case "currency": {
			const currency = resolveCurrency(options.currency);
			return new Intl.NumberFormat("en-IN", {
				...(currency ? { style: "currency" as const, currency } : {}),
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			}).format(Number(value));
		}
		case "percent":
			return new Intl.NumberFormat("en", {
				style: "percent",
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			}).format(Number(value) / 100);
		case "number":
			return new Intl.NumberFormat("en-IN").format(Number(value));
		case "date":
			return new Date(String(value)).toLocaleDateString("en-IN", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		default:
			return String(value);
	}
}
