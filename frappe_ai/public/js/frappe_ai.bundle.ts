import { createApp, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";
import { decideBoot } from "./frappe_ai/utils/boot-decision";
import { readBootSettings } from "./frappe_ai/utils/boot-settings";
import { frappeIcon } from "./frappe_ai/utils/frappe-icon";
import { createSidebarVisibilityController } from "./frappe_ai/utils/sidebar-visibility";

const SIDEBAR_ID = "frappe-ai-sidebar-root";

let vueApp: VueApp | null = null;

// App.vue owns whether the panel is open; the navbar button only mirrors it, and tryInject()
// rebuilds that button on every route change, so the state has to outlive the element
let sidebarOpen = false;

function syncNavExpanded(): void {
	document
		.getElementById("frappe-ai-nav-btn")
		?.setAttribute("aria-expanded", String(sidebarOpen));
}

/** Run `place` until it reports its element is in position, watching the body only while it is not. */
function keepPlaced(place: () => boolean): void {
	// the observer catches the boot repaint and the route event the SPA navigations it misses; it stops at the
	// first success, or every later DOM change in the desk — every streamed token included — pays for a
	// querySelectorAll and the forced layout of an offsetParent read
	const observer = new MutationObserver(() => settle());

	function settle(): void {
		if (place()) observer.disconnect();
		else observer.observe(document.body, { childList: true, subtree: true });
	}

	settle();
	frappe.router?.on?.("change", () => {
		settle();
		// the double rAF covers chrome painted a couple of frames after the route event
		requestAnimationFrame(() => requestAnimationFrame(settle));
	});
}

function injectNavbarButton(keyboardShortcut: string): void {
	/** Build a DOM element from an HTML string and wire its click handler. */
	function makeButton(html: string): HTMLElement {
		const tpl = document.createElement("template");
		tpl.innerHTML = html.trim();
		const btn = tpl.content.firstElementChild as HTMLElement;
		// a property, never interpolated into the markup below: the Translator role writes this
		// text, and a quotation mark in it would close the attribute and open one of its own
		btn.title = __("Frappe AI ({0})", [keyboardShortcut]);
		btn.addEventListener("click", toggleSidebar);
		btn.setAttribute("aria-controls", SIDEBAR_ID);
		btn.setAttribute("aria-expanded", String(sidebarOpen));
		// an <a> with no href is neither a button nor tabbable, so give it both halves
		if (btn.tagName === "A") {
			btn.setAttribute("role", "button");
			btn.tabIndex = 0;
			btn.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggleSidebar();
				}
			});
		}
		return btn;
	}

	// frappeIcon, not an inline <svg stroke="currentColor">, which takes the anchor's colour and vanishes on red themes
	function buildTopBtn(): HTMLElement {
		// `btn-reset nav-link text-muted` matches the bell — same hit-area, same
		// colour-inheritance path, same hover affordance — so the AI button reads
		// as a peer of the existing navbar icons across themes.
		return makeButton(
			`<button id="frappe-ai-nav-btn" type="button"
               class="btn-reset nav-link text-muted"
               style="cursor:pointer;background:transparent;border:none;display:flex;align-items:center;justify-content:center;padding:0 6px">${frappeIcon("message-square-text", "md")}</button>`,
		);
	}

	function buildSidebarBtn(): HTMLElement {
		// mirrors Frappe's "Getting Started" entry; text-ink-gray-7 current-color keeps the icon gray, not the anchor's colour
		const btn = makeButton(
			`<a id="frappe-ai-nav-btn" class="onboarding-sidebar frappe-ai-nav-link px-2">
          ${frappeIcon("message-square-text", "sm", "text-ink-gray-7 current-color")}
          <span class="sidebar-item-label"></span>
      </a>`,
		);
		// textContent, not the markup above, for the same reason as the title
		(btn.querySelector(".sidebar-item-label") as HTMLElement).textContent = __("Frappe AI");
		return btn;
	}

	// a visible .desktop-avatar only: v16 leaves the previous route's navbar in the DOM at 0x0 after a route change
	function tryInject(): boolean {
		const existing = document.getElementById("frappe-ai-nav-btn");
		const topAvatar = Array.from(
			document.querySelectorAll<HTMLElement>(".desktop-avatar"),
		).find((el) => el.offsetParent !== null);

		if (topAvatar?.parentNode) {
			if (
				existing &&
				existing.parentNode === topAvatar.parentNode &&
				existing.nextSibling === topAvatar
			) {
				return true;
			}
			existing?.remove();
			topAvatar.parentNode.insertBefore(buildTopBtn(), topAvatar);
			return true;
		}

		const sidebarUser = document.querySelector(".dropdown-navbar-user");
		if (!sidebarUser?.parentNode) return false;

		if (
			existing &&
			existing.parentNode === sidebarUser.parentNode &&
			existing.nextSibling === sidebarUser
		) {
			return true;
		}
		existing?.remove();
		sidebarUser.parentNode.insertBefore(buildSidebarBtn(), sidebarUser);
		return true;
	}

	keepPlaced(tryInject);
}

/** Publish the bar's measured height: Frappe's --page-head-height is the unthemed default, not what a theme paints. */
function syncHostChromeHeight(): void {
	const navbar = document.querySelector("header.navbar") as HTMLElement | null;
	const pageHead = document.querySelector(".page-head") as HTMLElement | null;
	const host = navbar?.offsetHeight ? navbar : pageHead?.offsetHeight ? pageHead : null;
	if (!host) {
		// no host chrome here (v16 Builder under /desk/*): drop the var so the CSS fallback wins over the last route's height
		document.documentElement.style.removeProperty("--frappe-ai-host-chrome-h");
		return;
	}
	const h = host.getBoundingClientRect().height;
	if (h > 0) {
		document.documentElement.style.setProperty("--frappe-ai-host-chrome-h", `${h}px`);
	}
}

function mountSidebar(sidebarWidth: number, keyboardShortcut: string): void {
	if (document.getElementById(SIDEBAR_ID)) return;

	const el = document.createElement("div");
	el.id = SIDEBAR_ID;
	el.hidden = true;
	el.style.setProperty("--frappe-ai-width", `${sidebarWidth}px`);
	document.body.appendChild(el);

	// the double rAF covers v16 Builder routes that paint their chrome a couple of frames after the route event
	syncHostChromeHeight();
	new ResizeObserver(syncHostChromeHeight).observe(document.body);
	frappe.router?.on?.("change", () => {
		syncHostChromeHeight();
		requestAnimationFrame(() => requestAnimationFrame(syncHostChromeHeight));
	});

	// the controller holds el.hidden past the slide-out and cancels that on a quick reopen (sidebar-visibility.ts);
	// measure again on open and after the next paint, since at mount the chrome may not have its themed height yet
	const visibility = createSidebarVisibilityController(el);
	document.addEventListener("frappe-ai-opened", () => {
		sidebarOpen = true;
		syncNavExpanded();
		visibility.onOpen();
		syncHostChromeHeight();
		requestAnimationFrame(syncHostChromeHeight);
	});
	document.addEventListener("frappe-ai-closed", () => {
		sidebarOpen = false;
		syncNavExpanded();
		visibility.onClose();
	});

	vueApp = createApp(App, { sidebarWidth, keyboardShortcut });
	vueApp.mount(el);

	injectNavbarButton(keyboardShortcut);

	// Frappe dispatches by the lowercase key string (alt+/), so the stored Alt+/ never fires unless lowercased
	frappe.ui.keys.add_shortcut({
		shortcut: keyboardShortcut.toLowerCase(),
		action: toggleSidebar,
		description: __("Toggle Frappe AI sidebar"),
		ignore_inputs: false,
	});
}

function toggleSidebar(): void {
	// App.vue owns the toggle state and dispatches frappe-ai-opened/closed
	// which syncs el.hidden (and the flex layout reflow).
	document.dispatchEvent(new CustomEvent("frappe-ai-toggle"));
}

/** Inject a small "AI is disabled — open settings" link in the navbar. */
function injectDisabledHint(): void {
	function build(): HTMLElement {
		const tpl = document.createElement("template");
		tpl.innerHTML = `
      <a id="frappe-ai-disabled-hint"
         href="/app/ai-assistant-settings"
         style="display:flex;align-items:center;color:var(--ink-gray-5,#888);padding:0 6px;text-decoration:none"
         class="nav-link text-muted">
        ${frappeIcon("message-square-text", "md")}
      </a>`.trim();
		const hint = tpl.content.firstElementChild as HTMLElement;
		// the Translator role writes this text: a property, never interpolated into the markup above
		hint.title = __("Frappe AI is disabled — open settings to re-enable");
		return hint;
	}

	function tryInject(): boolean {
		if (document.getElementById("frappe-ai-disabled-hint")) return true;
		const topAvatar = Array.from(
			document.querySelectorAll<HTMLElement>(".desktop-avatar"),
		).find((el) => el.offsetParent !== null);
		if (!topAvatar?.parentNode) return false;
		topAvatar.parentNode.insertBefore(build(), topAvatar);
		return true;
	}

	keepPlaced(tryInject);
}

// app_ready is frappe's own "the desk is up" event (desk.js), the one ERPNext mounts from;
// this bundle is a plain <script> in desk.html, so the handler is registered well before the desk triggers it
$(document).on("app_ready", () => {
	const settings = readBootSettings();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const roles = ((frappe as any).user_roles as string[]) || [];
	const decision = decideBoot({
		enabled: settings.enabled,
		roles,
		loadError: settings.loadError,
	});
	if (decision === "hidden") return;
	if (decision === "show-disabled-hint") {
		injectDisabledHint();
		return;
	}
	mountSidebar(settings.sidebarWidth, settings.keyboardShortcut);
});
