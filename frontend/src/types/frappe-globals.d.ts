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

interface FrappeSidebarItem {
  label: string;
  icon: string;
  standard: boolean;
  type: string;
  class?: string;
  onClick?: () => void;
}

interface FrappeSidebarSection {
  find: (selector: string) => { length: number };
}

interface FrappeSidebar {
  $standard_items_sections?: FrappeSidebarSection[];
  standard_items_setup?: boolean;
  add_item: (section: FrappeSidebarSection, item: FrappeSidebarItem) => void;
}

interface FrappeApp {
  sidebar?: FrappeSidebar;
}

interface FrappeSession {
  user?: string;
  user_email?: string;
}

interface FrappeGlobal {
  app?: FrappeApp;
  router?: FrappeRouter;
  utils: FrappeUtils;
  boot?: FrappeBoot;
  defaults?: FrappeDefaults;
  session?: FrappeSession;
  /** Navigate the desk to a route — accepts segments like ("Form", doctype, name). */
  set_route: (...path: string[]) => void;
  /**
   * Frappe call. Returns a Promise<{ message?: T }> when `async: true`; the
   * callback / error handlers are also invoked. Callers who use only
   * callbacks can ignore the returned Promise.
   */
  call: <TResponse = unknown>(args: FrappeCallArgs<TResponse>) => Promise<{ message?: TResponse }>;
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

interface JQueryStatic {
  (selector: Document | string): {
    on: (event: string, handler: () => void) => void;
  };
}

declare const frappe: FrappeGlobal | undefined;
declare const cur_frm: FrappeForm | undefined;
declare const cur_list: FrappeList | undefined;
declare const $: JQueryStatic;
declare function __(...args: string[]): string;
