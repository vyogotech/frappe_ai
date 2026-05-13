import { createApp, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";
import { useSettings } from "./frappe_ai/composables/useSettings";

const SIDEBAR_ID = "frappe-ai-sidebar-root";

let vueApp: VueApp | null = null;

function injectNavbarButton(keyboardShortcut: string): void {
  if (document.getElementById("frappe-ai-nav-btn")) return;

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

  function tryInject(): boolean {
    if (document.getElementById("frappe-ai-nav-btn")) return true;

    // Desk home renders the top navbar with .desktop-avatar; every other
    // route hides the top navbar and shows the user button inside the left
    // sidebar (.dropdown-navbar-user). Anchor to whichever exists so the
    // toggle is reachable on every page.
    //
    // jQuery is intentionally not used — Frappe v16.16+ scopes jQuery
    // into a module bundle, so `window.$` is undefined in app bundles.
    const topAvatar = document.querySelector(".desktop-avatar");
    if (topAvatar?.parentNode) {
      const btn = makeButton(
        `<div id="frappe-ai-nav-btn" title="Frappe AI (${keyboardShortcut})"
              style="cursor:pointer;display:flex;align-items:center;padding:0 4px">${svgIcon}</div>`,
      );
      topAvatar.parentNode.insertBefore(btn, topAvatar);
      return true;
    }

    const sidebarUser = document.querySelector(".dropdown-navbar-user");
    if (sidebarUser?.parentNode) {
      // Mimic the sibling sidebar nav items (icon + label, left-aligned)
      // so the AI toggle doesn't look orphaned next to Home/Search/Notification.
      const btn = makeButton(
        `<a id="frappe-ai-nav-btn"
            class="align-center btn-reset flex nav-link sidebar-user-button"
            style="cursor:pointer;width:100%;min-height:40px;padding:0 8px;gap:8px;color:var(--text-color)"
            title="Frappe AI (${keyboardShortcut})">
            <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 24px">${svgIcon}</span>
            <span style="font-size:13px;line-height:1.2">Frappe AI</span>
        </a>`,
      );
      sidebarUser.parentNode.insertBefore(btn, sidebarUser);
      return true;
    }

    return false;
  }

  tryInject();

  // Stays connected across SPA route changes — Frappe re-renders the navbar
  // when navigating between /desk, /app/<doctype>, form views, etc. If we
  // disconnect after the first inject the button vanishes on the next route
  // and the user has to hard-reload to get it back.
  const observer = new MutationObserver(() => {
    if (!document.getElementById("frappe-ai-nav-btn")) {
      tryInject();
    }
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

  frappe.ui.keys.add_shortcut({
    shortcut: keyboardShortcut,
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
