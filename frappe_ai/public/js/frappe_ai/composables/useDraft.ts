/** The chat input's unsent draft, kept across reloads in localStorage under a key per Frappe user. */

const STORAGE_PREFIX = "frappe_ai:draft:";
const SAVE_DEBOUNCE_MS = 500;

function currentUser(): string {
  // frappe.session.user can be undefined during early boot; fall back to
  // a fixed anon key so the draft just lives on the device.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (globalThis as any).frappe?.session?.user;
  return typeof user === "string" && user ? user : "__anon__";
}

function storageKey(): string {
  return STORAGE_PREFIX + currentUser();
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* private-mode or quota */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private-mode or quota */
  }
}

export interface DraftHandle {
  load: () => string;
  save: (value: string) => void;
  clear: () => void;
}

export function useDraft(): DraftHandle {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue = "";

  function flush() {
    pendingTimer = null;
    safeSet(storageKey(), pendingValue);
  }

  function cancelPending() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  return {
    load(): string {
      return safeGet(storageKey()) ?? "";
    },
    save(value: string) {
      pendingValue = value;
      cancelPending();
      pendingTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    clear() {
      cancelPending();
      pendingValue = "";
      safeRemove(storageKey());
    },
  };
}
