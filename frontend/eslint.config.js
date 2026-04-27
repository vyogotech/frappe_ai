import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import vueTsConfig from "@vue/eslint-config-typescript";

export default [
  { ignores: ["dist/**", "node_modules/**", "../frappe_ai/public/**"] },
  ...pluginVue.configs["flat/recommended"],
  ...vueTsConfig(),
  {
    languageOptions: {
      globals: { ...globals.browser, frappe: "readonly", jQuery: "readonly" },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      // Boundary code (frappe/jQuery globals, parsed JSON, third-party event
      // payloads) is widely typed as `any`. Downgrade to a warning so the rule
      // surfaces new uses without blocking on existing ones.
      "@typescript-eslint/no-explicit-any": "warn",
      // `defineProps` macro produces a binding that ESLint can't see being
      // used in <template>. Turn off plain unused-vars in <script setup>.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^(_|props$)" },
      ],
      // Formatter-style rules — handled by editor/prettier conventions, not lint.
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "vue/attributes-order": "off",
    },
  },
];
