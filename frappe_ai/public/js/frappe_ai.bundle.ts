import { createApp, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";
import { useSettings } from "./frappe_ai/composables/useSettings";
import { decideBoot } from "./frappe_ai/utils/boot-decision";
import { frappeIcon } from "./frappe_ai/utils/frappe-icon";
import { createSidebarVisibilityController } from "./frappe_ai/utils/sidebar-visibility";

const SIDEBAR_ID = "frappe-ai-sidebar-root";

let vueApp: VueApp | null = null;

function injectNavbarButton(keyboardShortcut: string): void {
  /** Build a DOM element from an HTML string and wire its click handler. */
  function makeButton(html: string): HTMLElement {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    const btn = tpl.content.firstElementChild as HTMLElement;
    btn.addEventListener("click", toggleSidebar);
    return btn;
  }

  // Use Frappe's own icon helper (via the shared `frappeIcon` wrapper) so the
  // AI button picks up the host theme's symbol stroke — exactly like the bell
  // sibling. Avoid inline `<svg stroke="currentColor">` because that inherits
  // whichever colour the wrapping anchor happens to have, which gave us the
  // invisible grey-on-red icon on Invox.
  function buildTopBtn(): HTMLElement {
    // `btn-reset nav-link text-muted` matches the bell — same hit-area, same
    // colour-inheritance path, same hover affordance — so the AI button reads
    // as a peer of the existing navbar icons across themes.
    return makeButton(
      `<button id="frappe-ai-nav-btn" type="button"
               class="btn-reset nav-link text-muted"
               style="cursor:pointer;background:transparent;border:none;display:flex;align-items:center;justify-content:center;padding:0 6px"
               title="Frappe AI (${keyboardShortcut})">${frappeIcon("message-square-text", "md")}</button>`,
    );
  }

  function buildSidebarBtn(): HTMLElement {
    // Mirrors Frappe's own "Getting Started" entry (`a.onboarding-sidebar`
    // inside `.body-sidebar-bottom`):
    //
    //   * `.onboarding-sidebar` + `.px-2` give the canonical layout (display:
    //     flex, align-items:center, 8px horizontal padding, 10px gap between
    //     svg and label).
    //   * `text-ink-gray-7 current-color` on the SVG keeps the icon stroke
    //     gray (`--ink-gray-7`) regardless of the anchor's `color` — peers
    //     have gray icons + themed text, so an unstyled SVG that follows the
    //     anchor's red `currentColor` reads as visually different.
    //   * `.frappe-ai-nav-link` is a scoping hook for our own CSS rules
    //     (currently only the collapsed-label hide and a margin-bottom that
    //     mimics Getting Started's `<p>` wrapper margin).
    return makeButton(
      `<a id="frappe-ai-nav-btn" class="onboarding-sidebar frappe-ai-nav-link px-2"
          title="Frappe AI (${keyboardShortcut})">
          ${frappeIcon("message-square-text", "sm", "text-ink-gray-7 current-color")}
          <span class="sidebar-item-label">Frappe AI</span>
      </a>`,
    );
  }

  // Idempotent: prefers the top navbar slot next to a *visibly mounted*
  // `.desktop-avatar`, falls back to the left sidebar slot otherwise.
  //
  // Visibility matters because Frappe v16 leaves the previous route's
  // `header.desktop-navbar` (with its `.desktop-avatar` child) in the DOM at
  // 0×0 after SPA route changes — so a bare `querySelector('.desktop-avatar')`
  // would happily match the orphan and strand the button in a hidden subtree
  // until the next hard refresh.
  //
  // jQuery is intentionally not used — Frappe v16.16+ scopes jQuery into
  // a module bundle, so `window.$` is undefined in app bundles.
  function tryInject(): void {
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
        return;
      }
      existing?.remove();
      topAvatar.parentNode.insertBefore(buildTopBtn(), topAvatar);
      return;
    }

    const sidebarUser = document.querySelector(".dropdown-navbar-user");
    if (!sidebarUser?.parentNode) return;

    if (
      existing &&
      existing.parentNode === sidebarUser.parentNode &&
      existing.nextSibling === sidebarUser
    ) {
      return;
    }
    existing?.remove();
    sidebarUser.parentNode.insertBefore(buildSidebarBtn(), sidebarUser);
  }

  tryInject();

  // Two triggers, both needed:
  //   - MutationObserver catches the host re-painting the navbar on initial
  //     boot (before the router has finished setting up).
  //   - frappe.router.on('change') is the canonical SPA route signal — fires
  //     deterministically when navigating /desk ↔ /app/* ↔ /desk/* Builder
  //     views, where MutationObserver alone can miss the right moment to
  //     re-evaluate the orphaned `.desktop-avatar` from the previous route.
  //     A double-rAF chase handles routes whose chrome paints a couple
  //     frames after the route event.
  const observer = new MutationObserver(tryInject);
  observer.observe(document.body, { childList: true, subtree: true });
  frappe.router?.on?.("change", () => {
    tryInject();
    requestAnimationFrame(() => requestAnimationFrame(tryInject));
  });
}

/** Publish the host chrome's measured height as a CSS variable so the
 * sidebar header can match whichever bar the current route renders.
 *
 * On `/desk` the chrome is `header.navbar` (the Invox red top bar — 52px on
 * that theme, 48px on the default theme). On `/app/*` the chrome is
 * `.page-head` (46px). Frappe v16 only exposes one of those as a CSS custom
 * property (`--page-head-height`), and it's just the unthemed default — so
 * reading the variable alone doesn't match what a custom theme actually
 * paints. Measuring the rendered element is the only way to align robustly
 * across themes, routes, and viewport changes.
 */
function syncHostChromeHeight(): void {
  const navbar = document.querySelector("header.navbar") as HTMLElement | null;
  const pageHead = document.querySelector(".page-head") as HTMLElement | null;
  const host = navbar?.offsetHeight ? navbar : pageHead?.offsetHeight ? pageHead : null;
  if (!host) {
    // Neither host chrome is rendered for this route — e.g. v16 Builder
    // workspaces under /desk/* paint their own header inside .main-section.
    // Drop the inline var so the CSS fallback (--page-head-height + 1px,
    // ≈46px) governs, instead of leaving a stale measurement from the
    // previously-visited route.
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

  // Initial sync + keep in lock-step with viewport resizes and SPA route
  // changes. `frappe.router.on('change')` is the canonical signal for SPA
  // navigation; the double-rAF chase covers v16 Builder routes that paint
  // their chrome a couple frames after the route event fires. ResizeObserver
  // catches viewport resizes (host theme breakpoints, dev-tools toggling).
  syncHostChromeHeight();
  new ResizeObserver(syncHostChromeHeight).observe(document.body);
  frappe.router?.on?.("change", () => {
    syncHostChromeHeight();
    requestAnimationFrame(() =>
      requestAnimationFrame(syncHostChromeHeight),
    );
  });

  // Sync the container's hidden attribute with App.vue's visible state.
  // On open: unhide immediately so Vue's enter-transition has a visible element to animate.
  // On close: delay until after the CSS leave-transition (250ms) finishes, otherwise
  // setting hidden=true collapses the container before the slide-out can play.
  //
  // The visibility controller owns the hide-timer cancellation so a rapid
  // close→open within the 300ms grace doesn't leave a stale timer that fires
  // AFTER the second open and silently re-hides the container. See BUG-001
  // and sidebar-visibility.test.ts.
  //
  // Re-run syncHostChromeHeight on open and after the next paint. The host's
  // navbar/page-head only reaches its final painted height once the desk has
  // finished its own layout pass — measuring at mount time alone can race the
  // theme's `.navbar { height }` rule and stamp the wrong value into
  // --frappe-ai-host-chrome-h. Resyncing here guarantees the sidebar header
  // bottom lands on the same baseline as the host chrome every time the panel
  // opens.
  const visibility = createSidebarVisibilityController(el);
  document.addEventListener("frappe-ai-opened", () => {
    visibility.onOpen();
    syncHostChromeHeight();
    requestAnimationFrame(syncHostChromeHeight);
  });
  document.addEventListener("frappe-ai-closed", () => {
    visibility.onClose();
  });

  vueApp = createApp(App, { sidebarWidth, keyboardShortcut });
  vueApp.mount(el);

  injectNavbarButton(keyboardShortcut);

  // Frappe normalizes keydown events to a lowercase shortcut string (e.g.
  // `alt+/`) before dispatching to `frappe.ui.keys.handlers`. The settings
  // doctype stores user-friendly mixed case (default `Alt+/`), so registering
  // verbatim leaves an entry under `Alt+/` that the dispatcher never reaches.
  // Lowercasing at registration time keeps the displayed default friendly
  // while ensuring the handler actually fires.
  frappe.ui.keys.add_shortcut({
    shortcut: keyboardShortcut.toLowerCase(),
    action: toggleSidebar,
    description: "Toggle Frappe AI sidebar",
    ignore_inputs: false,
  });
}

function toggleSidebar(): void {
  // App.vue owns the toggle state and dispatches frappe-ai-opened/closed
  // which syncs el.hidden (and the flex layout reflow).
  document.dispatchEvent(new CustomEvent("frappe-ai-toggle"));
}

// Wait for Frappe to finish booting before mounting. The `app_ready` event
// is dispatched via jQuery (`$(document).trigger("app_ready")`) which used
// to be picked up by `$(document).on("app_ready", …)` — but Frappe v16.16+
// scoped jQuery into a module bundle, so `window.$` no longer exists when
// app bundles run.
//
// Poll for `frappe.boot` (set very early during desk init) + `document.body`
// being non-empty. `frappe.app` would be tempting but it's only set by the
// desk controller and isn't reliable across dev/prod environments. boot is
// enough — once boot is in place, the desk's `frappe.call` / `frappe.realtime`
// helpers we depend on are wired up.
function onFrappeReady(handler: () => void): void {
  const tick = (attempts: number) => {
    if (
      typeof frappe !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (frappe as any).boot &&
      // Body has been hydrated past the bare loading skeleton.
      document.body.children.length > 1
    ) {
      handler();
      return;
    }
    if (attempts > 900) return; // 90s cap — desk that doesn't reach boot+body in 90s is broken
    setTimeout(() => tick(attempts + 1), 100);
  };
  tick(0);
}

/** Inject a small "AI is disabled — open settings" link in the navbar.
 *
 * OBS-015: System Managers who toggle Enabled off lose the chat icon and
 * have no in-UI clue how to turn it back on. This marker fills that gap
 * — for them only; regular users can't enable it so they see nothing.
 */
function injectDisabledHint(): void {
  function build(): HTMLElement {
    const tpl = document.createElement("template");
    tpl.innerHTML = `
      <a id="frappe-ai-disabled-hint"
         href="/app/ai-assistant-settings"
         title="Frappe AI is disabled — open settings to re-enable"
         style="display:flex;align-items:center;color:var(--ink-gray-5,#888);padding:0 6px;text-decoration:none"
         class="nav-link text-muted">
        ${frappeIcon("message-square-text", "md")}
      </a>`.trim();
    return tpl.content.firstElementChild as HTMLElement;
  }

  function tryInject(): void {
    if (document.getElementById("frappe-ai-disabled-hint")) return;
    const topAvatar = Array.from(
      document.querySelectorAll<HTMLElement>(".desktop-avatar"),
    ).find((el) => el.offsetParent !== null);
    if (!topAvatar?.parentNode) return;
    topAvatar.parentNode.insertBefore(build(), topAvatar);
  }

  tryInject();
  const observer = new MutationObserver(tryInject);
  observer.observe(document.body, { childList: true, subtree: true });
  frappe.router?.on?.("change", () => {
    tryInject();
    requestAnimationFrame(() => requestAnimationFrame(tryInject));
  });
}

onFrappeReady(async () => {
  const { settings, loadSettings } = useSettings();
  await loadSettings();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles = ((frappe as any).user_roles as string[]) || [];
  const decision = decideBoot({ enabled: settings.value.enabled, roles });
  if (decision === "hidden") return;
  if (decision === "show-disabled-hint") {
    injectDisabledHint();
    return;
  }
  mountSidebar(settings.value.sidebarWidth, settings.value.keyboardShortcut);
});
