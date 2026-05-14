/**
 * Returns the SVG markup for a Frappe icon. Default behaviour matches Frappe
 * core — the SVG carries only `icon icon-{size}`, leaving the symbol's own
 * hard-coded stroke (~#383838 dark gray) to render. This is what Frappe's
 * own navbar icons (bell, chat-with-us) look like, so callers placing icons
 * in the top navbar get parity for free.
 *
 * Pass `'current-color'` in `extraSvgClasses` when the surrounding container
 * changes its `color` between states and you want the icon stroke to track
 * it — most notably the send button, which toggles between a muted-gray
 * idle state and a slate active state and needs the arrow to remain
 * visible against both.
 *
 * Pass `'text-ink-gray-7 current-color'` when you want the icon locked to
 * a specific colour token regardless of parent color (e.g. the sidebar nav
 * button, which sits inside a red anchor but should keep its gray icon to
 * match the peer "Getting Started" entry).
 *
 * Frappe's underlying `frappe.utils.icon(name, size, useClass, style,
 * svgClass, …)` takes the SVG-class string as its 5th positional argument.
 */
export function frappeIcon(name: string, size: string, extraSvgClasses = ""): string {
  if (typeof frappe !== "undefined" && frappe.utils?.icon) {
    return frappe.utils.icon(name, size, "", "", extraSvgClasses);
  }
  const cls = ["icon", `icon-${size}`, extraSvgClasses].filter(Boolean).join(" ");
  return `<svg class="${cls}"><use href="#icon-${name}"></use></svg>`;
}
