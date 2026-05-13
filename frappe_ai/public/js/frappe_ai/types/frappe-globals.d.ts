/**
 * Ambient declarations for the Frappe globals injected into the desk page.
 *
 * The actual runtime objects come from Frappe's bundle (loaded by ERPNext
 * before our bootstrap runs); this file only describes the surface we touch.
 * Everything else in the Frappe global is unmodelled and intentionally not
 * exposed — accessing an unknown member should be a type error so we notice
 * before shipping.
 */

interface FrappeCallArgs<TResponse = unknown> {
  method: string;
  args?: Record<string, unknown>;
  /** When true, frappe.call returns a Promise; the callback is still invoked. */
  async?: boolean;
  /** `r.message` is the unwrapped value the server returned; absent on error. */
  callback?: (r: { message?: TResponse }) => void;
  error?: (err: FrappeCallError) => void;
}

interface FrappeCallError {
  name?: string;
  message?: string;
  responseJSON?: { _server_messages?: string };
}

interface FrappeUtils {
  /** Frappe accepts arbitrary size hints; common values are "sm" / "md" / "lg". */
  icon: (name: string, size?: string) => string;
}

interface FrappeBootSysDefaults {
  currency?: string;
}

interface FrappeBoot {
  sysdefaults?: FrappeBootSysDefaults;
}

interface FrappeDefaults {
  get_default: (key: string) => string | null | undefined;
}

interface FrappeRouter {
  current_route?: string[];
}

interface FrappeRealtime {
  /**
   * Subscribe to a realtime event. `T` is the caller's expected payload
   * shape — the framework hands the handler an arbitrary JSON value, so
   * type-narrowing inside the handler is the caller's responsibility.
   */
  on: <T = unknown>(event: string, handler: (data: T) => void) => void;
  off: (event: string, handler?: (data: unknown) => void) => void;
}

interface FrappeUIKeys {
  add_shortcut: (opts: {
    shortcut: string;
    action: () => void;
    description: string;
    ignore_inputs: boolean;
  }) => void;
}

interface FrappeUI {
  keys: FrappeUIKeys;
}

interface FrappeGlobal {
  router?: FrappeRouter;
  utils: FrappeUtils;
  boot?: FrappeBoot;
  defaults?: FrappeDefaults;
  realtime: FrappeRealtime;
  ui: FrappeUI;
  /** Navigate the desk to a route — accepts segments like ("Form", doctype, name). */
  set_route: (...path: string[]) => void;
  /**
   * Frappe call. Returns a Promise<{ message?: T }> when `async: true`; the
   * callback / error handlers are also invoked. Callers who use only
   * callbacks can ignore the returned Promise.
   */
  call: <TResponse = unknown>(
    args: FrappeCallArgs<TResponse>,
  ) => Promise<{ message?: TResponse }>;
}

interface FrappeFormDoc {
  doctype?: string;
  name?: string;
  currency?: string;
}

interface FrappeForm {
  doc?: FrappeFormDoc;
}

interface FrappeList {
  doctype?: string;
}

interface JQuery {
  length: number;
  on: (event: string, handler: () => void) => JQuery;
  insertBefore: (target: JQuery) => JQuery;
}

interface JQueryStatic {
  (selector: Document | string | HTMLElement): JQuery;
}

// `frappe` is loaded by Frappe's bundle before our `app_ready` hook fires, so
// every site we touch can treat it as defined. Defensive `typeof frappe ===
// "undefined"` guards in context.ts / formatters.ts still narrow at runtime
// even though the static type asserts presence.
declare const frappe: FrappeGlobal;
declare const cur_frm: FrappeForm | undefined;
declare const cur_list: FrappeList | undefined;
declare const $: JQueryStatic;
