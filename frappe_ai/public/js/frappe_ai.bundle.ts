/**
 * Bundle entry — compiled by Frappe's esbuild + esbuild-plugin-vue3.
 * Output: /assets/frappe_ai/dist/js/frappe_ai.bundle.<hash>.js
 *
 * Sourced from public/js/frappe_ai/* — Vue SFCs, composables, types, utils.
 * Phase 1 keeps the existing bootstrap behavior; Phase 5 replaces the
 * polling-based navbar injection and adds the v16 flex-sibling mount.
 */

import { createApp } from "vue";
import App from "./frappe_ai/App.vue";
import { setAgentUrl } from "./frappe_ai/composables/useChat";

const CONTAINER_ID = "frappe-ai-sidebar-root";

interface FrappeAISettings {
  enabled?: boolean;
  agent_url?: string;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const state = {
  enabled: false,
  agentUrl: "",
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
      state.agentUrl = settings.agent_url || "";
      state.sidebarWidth = settings.sidebar_width || 380;
      state.keyboardShortcut = settings.keyboard_shortcut || "Ctrl+/";
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

function bootstrap(): void {
  if (typeof frappe === "undefined") {
    state.enabled = true;
    state.ready = true;
    mountApp();
    return;
  }

  $(document).on("app_ready", () => {
    loadSettings().then(() => {
      if (state.enabled) {
        mountApp();
      }
    });
  });
}

bootstrap();
