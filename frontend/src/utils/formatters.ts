/** Value formatting for block components. */

type FormatOptions = {
  currency?: string;
};

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
      const currencyCode = options.currency || "INR";
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
