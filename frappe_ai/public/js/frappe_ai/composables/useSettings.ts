/** Load Frappe AI Settings from the backend. */

import { ref, readonly, type Ref } from "vue";

export interface FrappeAISettings {
  enabled: boolean;
  agentUrl: string;
  sidebarWidth: number;
  keyboardShortcut: string;
}

/** Wire shape returned by frappe_ai.api.get_settings. */
interface FrappeAISettingsResponse {
  enabled?: boolean;
  agent_url?: string;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const DEFAULT_SETTINGS: FrappeAISettings = {
  enabled: false,
  agentUrl: "",
  sidebarWidth: 380,
  keyboardShortcut: "Ctrl+/",
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
          agentUrl: msg.agent_url ?? "",
          sidebarWidth: msg.sidebar_width ?? 380,
          keyboardShortcut: msg.keyboard_shortcut ?? "Ctrl+/",
        };
      }
      loaded.value = true;
    } catch {
      loaded.value = true;
    }
  }

  return {
    settings: readonly(settings),
    loaded: readonly(loaded),
    loadSettings,
  };
}
