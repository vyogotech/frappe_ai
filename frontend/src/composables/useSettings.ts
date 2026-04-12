/** Load Copilot Settings from the Frappe backend. */

import { ref, readonly, type Ref } from "vue";

declare const frappe: any;

export interface CopilotSettings {
  enabled: boolean;
  agentUrl: string;
  sidebarWidth: number;
  keyboardShortcut: string;
}

const DEFAULT_SETTINGS: CopilotSettings = {
  enabled: false,
  agentUrl: "ws://localhost:8484",
  sidebarWidth: 380,
  keyboardShortcut: "Ctrl+/",
};

const settings: Ref<CopilotSettings> = ref({ ...DEFAULT_SETTINGS });
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
          enabled: result.message.enabled,
          agentUrl: result.message.agent_url,
          sidebarWidth: result.message.sidebar_width,
          keyboardShortcut: result.message.keyboard_shortcut,
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
