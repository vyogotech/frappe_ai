import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "../tests/frontend/src/**/__tests__/**/*.test.ts",
    ],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@vue/test-utils": path.resolve(__dirname, "node_modules/@vue/test-utils"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, ".."), path.resolve(__dirname)],
    },
  },
});
