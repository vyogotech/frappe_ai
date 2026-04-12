/**
 * Post-build: stamp hooks.py asset URLs with a content hash.
 *
 * Why: Werkzeug serves /assets/ with max-age=43200 (12 h). Without a
 * changing query string, browsers serve stale bundles for 12 h even after
 * a hard refresh. Appending ?v=<md5-prefix> to the URL in hooks.py means
 * the browser sees a new URL on every build and fetches fresh content.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const jsFile = resolve(root, "frappe_ai/public/frontend/dist/js/frappe_ai.js");
const cssFile = resolve(root, "frappe_ai/public/css/frappe_ai_sidebar.css");
const hooksFile = resolve(root, "frappe_ai/hooks.py");

function md5prefix(filePath) {
  const buf = readFileSync(filePath);
  return createHash("md5").update(buf).digest("hex").slice(0, 8);
}

const jsHash = md5prefix(jsFile);
const cssHash = md5prefix(cssFile);

let hooks = readFileSync(hooksFile, "utf8");

// Replace or append ?v=<hash> on the JS line
hooks = hooks.replace(
  /(frappe_ai\.js)(?:\?v=[a-f0-9]+)?/,
  `$1?v=${jsHash}`,
);

// Replace or append ?v=<hash> on the CSS line
hooks = hooks.replace(
  /(frappe_ai_sidebar\.css)(?:\?v=[a-f0-9]+)?/,
  `$1?v=${cssHash}`,
);

writeFileSync(hooksFile, hooks);
console.log(`hooks.py updated: js?v=${jsHash}  css?v=${cssHash}`);
