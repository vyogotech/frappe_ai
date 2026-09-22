/** A Frappe icon's SVG in the symbol's own gray; "current-color" in extraSvgClasses strokes it in the text color. */
export function frappeIcon(name: string, size: string, extraSvgClasses = ""): string {
	if (typeof frappe !== "undefined" && frappe.utils?.icon) {
		return frappe.utils.icon(name, size, "", "", extraSvgClasses);
	}
	const cls = ["icon", `icon-${size}`, extraSvgClasses].filter(Boolean).join(" ");
	return `<svg class="${cls}"><use href="#icon-${name}"></use></svg>`;
}
