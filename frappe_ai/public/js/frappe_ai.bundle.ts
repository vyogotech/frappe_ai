import { createApp, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";
import { useSettings } from "./frappe_ai/composables/useSettings";
import { frappeIcon } from "./frappe_ai/utils/frappe-icon";

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
    // Modelled on Frappe's own workspace `.item-anchor` so the host's
    // "collapsed left sidebar hides labels" rule applies for free — see the
    // companion CSS rule in frappe_ai_sidebar.bundle.css.
    return makeButton(
      `<a id="frappe-ai-nav-btn" class="item-anchor frappe-ai-nav-link"
          style="cursor:pointer"
          title="Frappe AI (${keyboardShortcut})">
          <span class="sidebar-item-icon text-ink-gray-7" item-icon="frappe-ai">${frappeIcon("message-square-text", "sm")}</span>
          <span class="sidebar-item-label">Frappe AI</span>
      </a>`,
    );
  }

  // Idempotent: prefers the top navbar (`.desktop-avatar` is the only target
  // that's actually visible across Frappe v16.x layouts — the left-sidebar
  // slot ends up 0×0 when the sidebar is collapsed). Falls back to the sidebar
  // slot only if the navbar isn't in the DOM yet, and upgrades to the navbar
  // slot via the MutationObserver as soon as it appears.
  //
  // jQuery is intentionally not used — Frappe v16.16+ scopes jQuery into
  // a module bundle, so `window.$` is undefined in app bundles.
  function tryInject(): void {
    const existing = document.getElementById("frappe-ai-nav-btn");
    const topAvatar = document.querySelector(".desktop-avatar");

    if (topAvatar?.parentNode) {
      // Already in the right slot? Nothing to do.
      if (
        existing &&
        existing.parentNode === topAvatar.parentNode &&
        existing.nextSibling === topAvatar
      ) {
        return;
      }
      // Either no button yet, or it's stuck in the sidebar fallback from an
      // earlier inject — move it to the top navbar.
      existing?.remove();
      topAvatar.parentNode.insertBefore(buildTopBtn(), topAvatar);
      return;
    }

    if (existing) return;

    const sidebarUser = document.querySelector(".dropdown-navbar-user");
    if (sidebarUser?.parentNode) {
      sidebarUser.parentNode.insertBefore(buildSidebarBtn(), sidebarUser);
    }
  }

  tryInject();

  // Stays connected across SPA route changes — Frappe re-renders the navbar
  // when navigating between /desk, /app/<doctype>, form views, etc.
  // `tryInject` is now idempotent and self-upgrading: on every mutation it
  // re-checks whether the button is in the preferred slot and moves it if not.
  const observer = new MutationObserver(() => {
    tryInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
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
  if (!host) return;
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
  // changes (Frappe re-renders .page-head / header.navbar wholesale on
  // navigation, so a MutationObserver on body's direct children catches it).
  syncHostChromeHeight();
  new ResizeObserver(syncHostChromeHeight).observe(document.body);
  new MutationObserver(syncHostChromeHeight).observe(document.body, {
    childList: true,
    subtree: false,
  });

  // Sync the container's hidden attribute with App.vue's visible state.
  // On open: unhide immediately so Vue's enter-transition has a visible element to animate.
  // On close: delay until after the CSS leave-transition (250ms) finishes, otherwise
  // setting hidden=true collapses the container before the slide-out can play.
  //
  // Re-run syncHostChromeHeight on open and after the next paint. The host's
  // navbar/page-head only reaches its final painted height once the desk has
  // finished its own layout pass — measuring at mount time alone can race the
  // theme's `.navbar { height }` rule and stamp the wrong value into
  // --frappe-ai-host-chrome-h. Resyncing here guarantees the sidebar header
  // bottom lands on the same baseline as the host chrome every time the panel
  // opens.
  document.addEventListener("frappe-ai-opened", () => {
    el.hidden = false;
    syncHostChromeHeight();
    requestAnimationFrame(syncHostChromeHeight);
  });
  document.addEventListener("frappe-ai-closed", () => {
    setTimeout(() => {
      el.hidden = true;
    }, 300);
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

onFrappeReady(async () => {
  const { settings, loadSettings } = useSettings();
  await loadSettings();

  if (!settings.value.enabled) return;

  mountSidebar(settings.value.sidebarWidth, settings.value.keyboardShortcut);
});
