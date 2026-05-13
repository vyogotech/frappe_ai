import { createApp, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";
import { useSettings } from "./frappe_ai/composables/useSettings";

const SIDEBAR_ID = "frappe-ai-sidebar-root";

let vueApp: VueApp | null = null;

function injectNavbarButton(keyboardShortcut: string): void {
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`;

  /** Build a DOM element from an HTML string and wire its click handler. */
  function makeButton(html: string): HTMLElement {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    const btn = tpl.content.firstElementChild as HTMLElement;
    btn.addEventListener("click", toggleSidebar);
    return btn;
  }

  function buildTopBtn(): HTMLElement {
    return makeButton(
      `<div id="frappe-ai-nav-btn" title="Frappe AI (${keyboardShortcut})"
            style="cursor:pointer;display:flex;align-items:center;padding:0 4px">${svgIcon}</div>`,
    );
  }

  function buildSidebarBtn(): HTMLElement {
    return makeButton(
      `<a id="frappe-ai-nav-btn"
          class="align-center btn-reset flex nav-link sidebar-user-button"
          style="cursor:pointer;width:100%;min-height:40px;padding:0 8px;gap:8px;color:var(--text-color)"
          title="Frappe AI (${keyboardShortcut})">
          <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 24px">${svgIcon}</span>
          <span style="font-size:13px;line-height:1.2">Frappe AI</span>
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

function mountSidebar(sidebarWidth: number, keyboardShortcut: string): void {
  if (document.getElementById(SIDEBAR_ID)) return;

  const el = document.createElement("div");
  el.id = SIDEBAR_ID;
  el.hidden = true;
  el.style.setProperty("--frappe-ai-width", `${sidebarWidth}px`);
  document.body.appendChild(el);

  // Sync the container's hidden attribute with App.vue's visible state.
  // On open: unhide immediately so Vue's enter-transition has a visible element to animate.
  // On close: delay until after the CSS leave-transition (250ms) finishes, otherwise
  // setting hidden=true collapses the container before the slide-out can play.
  document.addEventListener("frappe-ai-opened", () => {
    el.hidden = false;
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
