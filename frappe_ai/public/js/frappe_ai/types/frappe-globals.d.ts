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
	/** The desk address of a document. Optional: a test environment has no desk utils. */
	get_form_link?: (doctype: string, name: string) => string;
}

interface FrappeBootSysDefaults {
	currency?: string;
}

/** What frappe_ai's extend_bootinfo hook puts on the boot; every key is optional, an older boot has none. */
interface FrappeAIBoot {
	enabled?: boolean;
	sidebar_width?: number;
	keyboard_shortcut?: string;
	timeout?: number;
}

interface FrappeBoot {
	sysdefaults?: FrappeBootSysDefaults;
	frappe_ai?: FrappeAIBoot;
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

interface FrappeAssets {
	/** A bundle's hashed URL from sites/assets/assets.json, or the path unchanged when it has none. */
	bundled_asset: (path: string) => string;
	/** Appends one <script> or <link> per path and resolves when it has run — or failed to load. */
	load_asset: (path: string, url: string) => Promise<void>;
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
	/** Optional: a test environment has no desk asset manager. */
	assets?: FrappeAssets;
	/** Navigate the desk to a route — accepts segments like ("Form", doctype, name). */
	set_route: (...path: string[]) => void;
	/** The document out of `locals`: null or undefined when it is not loaded. Optional: a test environment has no model layer. */
	get_doc?: (doctype: string, name: string) => FrappeDoc | null | undefined;
	/** The Promise is for async: true; callback and error are invoked either way. */
	call: <TResponse = unknown>(
		args: FrappeCallArgs<TResponse>,
	) => Promise<{ message?: TResponse }>;
}

interface FrappeDoc {
	currency?: string;
}

// frappe's libs.bundle.js sets window.$ (public/js/jquery-bootstrap.js) and desk.html loads it before any app bundle;
// only the one member we use is declared, so a wider jQuery call is a type error
declare const $: (target: Document) => {
	on: (event: "app_ready", handler: () => void) => void;
};

interface Window {
	/** Set by frappe_ai_chart.bundle.ts; undefined until ChartBlock has loaded that bundle. */
	frappe_ai_echarts?: typeof import("../components/blocks/chart-echarts");
}

// declared as always present, which tsc cannot check; keep the runtime typeof frappe guards anyway
declare const frappe: FrappeGlobal;

// frappe's translate.js sets window.__ = frappe._; `replace` fills indexed {0}, {1} only, and a named {key}
// renders as "undefined". Never call it from a template expression: Vue compiles that to _ctx.__, which this
// app's plain createApp leaves undefined.
declare function __(txt: string, replace?: (string | number)[]): string;
