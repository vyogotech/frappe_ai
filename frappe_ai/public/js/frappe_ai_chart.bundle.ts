/** echarts on demand: a desk page with no chart block in it never loads this file. */

// Frappe's esbuild emits one output per public/**/*.bundle.ts and keys sites/assets/assets.json by this
// file's name, which is how ChartBlock asks for it. It sets no `splitting`, so this output shares nothing
// with the desk bundle: it has to hold echarts alone, with no Vue in it.

import * as echarts from "./frappe_ai/components/blocks/chart-echarts";

window.frappe_ai_echarts = echarts;
