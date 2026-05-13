import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["frappe_ai/public/js/frappe_ai/**/*.test.{ts,vue}"],
    setupFiles: ["frappe_ai/public/js/frappe_ai/__tests__/setup.ts"],
  },
});
