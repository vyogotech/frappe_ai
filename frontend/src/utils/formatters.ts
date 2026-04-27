/** Value formatting for block components. */

declare const frappe: any;

type FormatOptions = {
  currency?: string;
};

/**
 * Resolve the currency to use for formatting. Priority:
 *   1. caller-supplied options.currency
 *   2. frappe.boot.sysdefaults.currency (Company.default_currency)
 *   3. frappe.defaults.get_default("currency")
 *   4. INR fallback (matches the agent prompt fallback so prose text and
 *      table cells stay consistent)
 */
function resolveCurrency(supplied?: string): string {
  if (supplied) return supplied;
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
    // ignore — fall through to default
  }
  return "INR";
}

export function formatValue(
  value: unknown,
  format?: string,
  options: FormatOptions = {},
): string {
  if (value === null || value === undefined) {
    return "—";
  }

  switch (format) {
    case "currency": {
      const currencyCode = resolveCurrency(options.currency);
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currencyCode,
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
