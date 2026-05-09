import { createApp, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";

const SIDEBAR_ID = "frappe-ai-sidebar";

let vueApp: VueApp | null = null;

interface FrappeAISettings {
  enabled?: boolean;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const state = {
  enabled: false,
  sidebarWidth: 380,
  keyboardShortcut: "Ctrl+/",
};

async function loadSettings(): Promise<void> {
  try {
    const settings = await new Promise<FrappeAISettings>((resolve, reject) => {
      frappe.call<FrappeAISettings>({
        method: "frappe_ai.api.get_settings",
        callback: (r) => resolve(r.message ?? {}),
        error: reject,
      });
    });
    state.enabled = Boolean(settings.enabled);
    state.sidebarWidth = settings.sidebar_width ?? 380;
    state.keyboardShortcut = settings.keyboard_shortcut ?? "Ctrl+/";
  } catch (err) {
    console.warn("[Frappe AI] Could not load settings:", err);
  }
}

function mountSidebar(): void {
  if (document.getElementById(SIDEBAR_ID)) return;

  const el = document.createElement("div");
  el.id = SIDEBAR_ID;
  el.hidden = true;
  el.style.setProperty("--frappe-ai-width", `${state.sidebarWidth}px`);
  document.body.appendChild(el);

  // Sync container hidden attribute with App.vue's visible state.
  // App.vue dispatches these after updating its own visible ref.
  document.addEventListener("frappe-ai-opened", () => { el.hidden = false; });
  document.addEventListener("frappe-ai-closed", () => { el.hidden = true; });

  vueApp = createApp(App, {
    sidebarWidth: state.sidebarWidth,
    keyboardShortcut: state.keyboardShortcut,
  });
  vueApp.mount(el);

  frappe.ui.keys.add_shortcut({
    shortcut: state.keyboardShortcut,
    action: toggleSidebar,
    description: "Toggle Frappe AI sidebar",
    ignore_inputs: false,
  });
}

function toggleSidebar(): void {
  // Let App.vue own the toggle state; it will dispatch frappe-ai-opened/closed
  // which syncs el.hidden (and thus the flex layout reflow).
  document.dispatchEvent(new CustomEvent("frappe-ai-toggle"));
}

$(document).on("app_ready", async () => {
  const frappeVersion: string = frappe?.boot?.versions?.frappe ?? "";
  if (frappeVersion.startsWith("15")) {
    console.warn("[Frappe AI] Requires Frappe v16+. Skipping mount.");
    return;
  }

  await loadSettings();
  if (!state.enabled) return;

  mountSidebar();
});
