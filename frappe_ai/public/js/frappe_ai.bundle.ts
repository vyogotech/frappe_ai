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

  function tryInject(): boolean {
    if (document.getElementById("frappe-ai-nav-btn")) return true;

    // Frappe v16 desk navbar — insert the toggle button before the user avatar.
    const $avatar = $(".desktop-avatar");
    if ($avatar.length) {
      const $btn = $(
        `<div id="frappe-ai-nav-btn" title="Frappe AI (${keyboardShortcut})"
              style="cursor:pointer;display:flex;align-items:center;padding:0 4px">${svgIcon}</div>`,
      );
      $btn.on("click", toggleSidebar);
      $btn.insertBefore($avatar);
      return true;
    }

    return false;
  }

  if (tryInject()) return;

  // Frappe v16 renders the navbar element after app_ready in some configurations.
  // Use MutationObserver to inject once .desktop-avatar appears in the DOM.
  const observer = new MutationObserver(() => {
    if (tryInject()) observer.disconnect();
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

$(document).on("app_ready", async () => {
  const { settings, loadSettings } = useSettings();
  await loadSettings();

  if (!settings.value.enabled) return;

  mountSidebar(settings.value.sidebarWidth, settings.value.keyboardShortcut);
});
