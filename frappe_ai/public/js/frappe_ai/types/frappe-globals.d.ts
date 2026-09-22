/** The desk's Frappe globals, only the members we use, so an unmodelled one is a type error. */

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
  /** useClass goes on the <use> element and svgClass on the <svg>; size is "sm", "md", "lg" or the like. */
  icon: (
    name: string,
    size?: string,
    useClass?: string,
    style?: string,
    svgClass?: string,
  ) => string;
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
  /** "change" fires after every SPA navigation, the first desk load included. */
  on?: (event: "change" | string, handler: (...args: unknown[]) => void) => void;
  off?: (event: "change" | string, handler?: (...args: unknown[]) => void) => void;
}

interface FrappeRealtime {
  /** T is not checked: the handler gets whatever JSON was published and must narrow it. */
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
  csrf_token?: string;
  router?: FrappeRouter;
  utils: FrappeUtils;
  boot?: FrappeBoot;
  defaults?: FrappeDefaults;
  realtime: FrappeRealtime;
  ui: FrappeUI;
  /** Navigate the desk to a route — accepts segments like ("Form", doctype, name). */
  set_route: (...path: string[]) => void;
  /** The Promise is for async: true; callback and error are invoked either way. */
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

// $ is left undeclared on purpose: v16.16+ scopes jQuery out of app bundles, so any $(...) must fail tsc

// declared as always present, which tsc cannot check; keep the runtime typeof frappe guards anyway
declare const frappe: FrappeGlobal;
declare const cur_frm: FrappeForm | undefined;
declare const cur_list: FrappeList | undefined;
