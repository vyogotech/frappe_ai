/** Load Frappe AI Settings from the backend. Module-level singleton. */

import { ref, readonly, type Ref } from "vue";

export interface FrappeAISettings {
  enabled: boolean;
  sidebarWidth: number;
  keyboardShortcut: string;
}

interface FrappeAISettingsResponse {
  enabled?: boolean;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const DEFAULT_SETTINGS: FrappeAISettings = {
  enabled: false,
  sidebarWidth: 380,
  // Matches the doctype default; `Ctrl+/` is reserved by Frappe v16.
  keyboardShortcut: "Alt+/",
};

const settings: Ref<FrappeAISettings> = ref({ ...DEFAULT_SETTINGS });
const loaded = ref(false);

export function useSettings() {
  async function loadSettings(): Promise<void> {
    if (typeof frappe === "undefined") {
      loaded.value = true;
      return;
    }
    try {
      const result = await frappe.call<FrappeAISettingsResponse>({
        method: "frappe_ai.api.get_settings",
        async: true,
      });
      const msg = result?.message;
      if (msg) {
        settings.value = {
          enabled: msg.enabled ?? false,
          sidebarWidth: msg.sidebar_width ?? 380,
          keyboardShortcut: msg.keyboard_shortcut ?? "Alt+/",
        };
      }
    } catch {
      // fall back to defaults
    } finally {
      loaded.value = true;
    }
  }

  return {
    settings: readonly(settings),
    loaded: readonly(loaded),
    loadSettings,
  };
}
