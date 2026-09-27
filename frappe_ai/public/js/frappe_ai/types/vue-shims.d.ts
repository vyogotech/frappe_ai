/** Lets TypeScript resolve an import of a .vue file to a component. */

declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
	export default component;
}

/** The one node:fs call the CSS-rule tests make; vitest stubs a `?raw` CSS import to "". */
declare module "node:fs" {
	export function readFileSync(path: string, encoding: "utf8"): string;
}
