/** Load Frappe AI Settings from the backend. */

import { ref, readonly, type Ref } from "vue";

declare const frappe: any;

export interface FrappeAISettings {
  enabled: boolean;
  agentUrl: string;
  sidebarWidth: number;
  keyboardShortcut: string;
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
    try {
      const result = await frappe.call({
        method: "frappe_ai.api.get_settings",
        async: true,
      });
      if (result?.message) {
        settings.value = {
          enabled: result.message.enabled ?? false,
          agentUrl: result.message.agent_url ?? "",
          sidebarWidth: result.message.sidebar_width ?? 380,
          keyboardShortcut: result.message.keyboard_shortcut ?? "Ctrl+/",
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
