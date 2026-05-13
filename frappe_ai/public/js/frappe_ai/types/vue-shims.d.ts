/** Allow `import X from "./Foo.vue"` — Vue SFCs aren't .ts files, so the TS
 *  language server needs a module shim to resolve them to a Component type. */

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
