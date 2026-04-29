/** Bootstrap: load settings, mount sidebar app, inject navbar button and sidebar item. */

import { createApp } from "vue";
import App from "./App.vue";
import { setAgentUrl } from "./composables/useChat";

const CONTAINER_ID = "frappe-ai-sidebar-root";

interface FrappeAISettings {
  enabled?: boolean;
  agent_url?: string;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const state = {
  enabled: false,
  agentUrl: "http://localhost:8484",
  sidebarWidth: 380,
  keyboardShortcut: "Ctrl+/",
  ready: false,
};

async function loadSettings(): Promise<void> {
  if (typeof frappe === "undefined") return;
  try {
    const settings = await new Promise<FrappeAISettings | undefined>((resolve, reject) => {
      frappe.call<FrappeAISettings>({
        method: "frappe_ai.api.get_settings",
        callback: (r) => resolve(r.message),
        error: reject,
      });
    });
    if (settings) {
      state.enabled = Boolean(settings.enabled);
      state.agentUrl = settings.agent_url || "http://localhost:8484";
      state.sidebarWidth = settings.sidebar_width || 380;
      state.keyboardShortcut = settings.keyboard_shortcut || "Ctrl+/";
      // Make the agent URL available to useChat for SSE streaming.
      if (state.agentUrl) {
        setAgentUrl(state.agentUrl);
      }
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
    if (typeof frappe === "undefined") return;
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
    if (typeof frappe === "undefined") return;
    const sidebar = frappe.app?.sidebar;
    if (!sidebar?.$standard_items_sections?.length) return;
    if (!sidebar.standard_items_setup) return;
    clearInterval(interval);
    const firstSection = sidebar.$standard_items_sections[0];
    if (firstSection.find('[item-name="Frappe AI"]').length) return;
    sidebar.add_item(firstSection, {
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

  if (frappe?.app) {
    init();
  } else {
    $(document).on("app_ready", init);
  }
}

bootstrap();
