import path from "path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      name: "FrappeAI",
      formats: ["iife"],
      fileName: () => "js/frappe_ai.js",
    },
    outDir: "../frappe_ai/public/frontend/dist",
    emptyOutDir: true,
    rollupOptions: {
      external: ["frappe", "jQuery"],
      output: {
        globals: {
          frappe: "frappe",
          jQuery: "jQuery",
        },
        assetFileNames: "css/frappe_ai.[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
