/** Bootstrap: load settings, mount sidebar app, inject navbar button and sidebar item. */

import { createApp } from "vue";
import App from "./App.vue";

declare const frappe: any;
declare const $: any;
declare function __(...args: any[]): string;

const CONTAINER_ID = "frappe-ai-sidebar-root";

const state = {
  enabled: false,
  mcpServerUrl: "http://localhost:8080",
  sidebarWidth: 380,
  keyboardShortcut: "Ctrl+/",
  ready: false,
};

async function loadSettings(): Promise<void> {
  try {
    const settings = await new Promise<any>((resolve, reject) => {
      frappe.call({
        method: "frappe_ai.api.get_settings",
        callback: (r: any) => resolve(r.message),
        error: reject,
      });
    });
    if (settings) {
      state.enabled = Boolean(settings.enabled);
      state.mcpServerUrl = settings.mcp_server_url || "http://localhost:8080";
      state.sidebarWidth = settings.sidebar_width || 380;
      state.keyboardShortcut = settings.keyboard_shortcut || "Ctrl+/";
    }
  } catch (err) {
    console.warn("[Frappe AI] Could not load settings:", err);
  }
  state.ready = true;
}

function mountApp(): void {
  if (document.getElementById(CONTAINER_ID)) return;
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  createApp(App, {
    sidebarWidth: state.sidebarWidth,
    keyboardShortcut: state.keyboardShortcut,
  }).mount(container);
}

/**
 * Inject toggle button into the ERPNext v16 desktop navbar.
 * Targets .desktop-navbar .desktop-notifications (the bell icon),
 * inserts before it in the right-side flex container.
 */
function addNavbarToggle(): void {
  const interval = setInterval(() => {
    if (document.getElementById("frappe-ai-toggle-btn")) {
      clearInterval(interval);
      return;
    }
    const navNotifications = document.querySelector(".desktop-navbar .desktop-notifications");
    if (!navNotifications) return;
    clearInterval(interval);

    const rightContainer = navNotifications.parentElement!;
    const btn = document.createElement("button");
    btn.id = "frappe-ai-toggle-btn";
    btn.className = "btn-reset nav-link text-muted";
    btn.title = `Frappe AI (${state.keyboardShortcut})`;
    btn.innerHTML = frappe.utils.icon("message-square-text", "sm");
    btn.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("frappe-ai-toggle"));
    });
    rightContainer.insertBefore(btn, navNotifications);
  }, 100);
  setTimeout(() => clearInterval(interval), 10000);
}

/** Add "Frappe AI" item to the Frappe left sidebar. */
function addSidebarItem(): void {
  const interval = setInterval(() => {
    const sidebar = frappe.app?.sidebar;
    if (!sidebar?.$standard_items_sections?.length) return;
    if (!sidebar.standard_items_setup) return;
    clearInterval(interval);
    if (sidebar.$standard_items_sections.find('[item-name="Frappe AI"]').length) return;
    sidebar.add_item(sidebar.$standard_items_sections, {
      label: __("Frappe AI"),
      icon: "message-square-text",
      standard: true,
      type: "Button",
      class: "frappe-ai-toggle",
      onClick: () => {
        document.dispatchEvent(new CustomEvent("frappe-ai-toggle"));
      },
    });
  }, 100);
  setTimeout(() => clearInterval(interval), 10000);
}

function measureNavbarHeight(): void {
  const navbar = document.querySelector("header.desktop-navbar");
  if (navbar) {
    document.documentElement.style.setProperty(
      "--frappe-ai-navbar-height",
      (navbar as HTMLElement).offsetHeight + "px",
    );
  }
}

/**
 * Push layout: shift .main-section right when the sidebar opens
 * so ERPNext content is not covered. Uses CSS variables set on <html>.
 */
function setupPushLayout(): void {
  measureNavbarHeight();
  document.addEventListener("frappe-ai-opened", () => {
    if (window.innerWidth >= 768) {
      measureNavbarHeight();
      document.documentElement.style.setProperty("--frappe-ai-push", state.sidebarWidth + "px");
    }
  });
  document.addEventListener("frappe-ai-closed", () => {
    document.documentElement.style.setProperty("--frappe-ai-push", "0px");
  });
}

function bootstrap(): void {
  // Dev mode — no frappe global, mount immediately
  if (typeof frappe === "undefined") {
    state.enabled = true;
    state.ready = true;
    mountApp();
    return;
  }

  function init() {
    loadSettings().then(() => {
      if (state.enabled) {
        mountApp();
        setupPushLayout();
        addNavbarToggle();
        addSidebarItem();
      }
    });
  }

  if (frappe.app) {
    init();
  } else {
    $(document).on("app_ready", init);
  }
}

bootstrap();
