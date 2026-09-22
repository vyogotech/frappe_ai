import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import vue from "eslint-plugin-vue";
import vueA11y from "eslint-plugin-vuejs-accessibility";
import globals from "globals";
import ts from "typescript-eslint";

export default defineConfig([
	globalIgnores(["node_modules/**", ".venv/**", "audit-out/**", "frappe_ai/public/dist/**"]),
	js.configs.recommended,
	ts.configs.recommended,
	vue.configs["flat/recommended"],
	vueA11y.configs["flat/recommended"],
	{
		files: ["frappe_ai/public/js/**/*.{ts,vue}"],
		languageOptions: {
			globals: { ...globals.browser, frappe: "readonly" },
			parserOptions: { parser: ts.parser },
		},
		// the three that are findings rather than layout: raise them out of eslint-plugin-vue's warn default
		rules: {
			"no-console": "error",
			"no-empty": "error",
			"vue/no-v-html": "error",
		},
	},
	{
		// desk client scripts, loaded by the Desk rather than bundled: frappe and __ are its globals
		files: ["frappe_ai/**/doctype/**/*.js"],
		languageOptions: { globals: { ...globals.browser, frappe: "readonly", __: "readonly" } },
	},
	// last, so it wins: Prettier owns layout and these rules would only disagree with it
	prettier,
]);
