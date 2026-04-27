import path from "path";
import { execSync } from "child_process";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Build-time version stamp surfaced on the sidebar welcome screen so you can
// tell at a glance whether the running bundle includes a recent edit.
// Format: <YYYY-MM-DD HH:mm UTC> · <git short sha>[-dirty]
function buildVersion() {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  // Prefer SHA passed in from the host (set by `make reload-frontend`) since
  // the build often runs inside a container that has no .git directory.
  // Fall back to in-container `git rev-parse` if that's available.
  let sha = process.env.FRAPPE_AI_BUILD_SHA || "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
      const dirty = execSync("git status --porcelain", { cwd: __dirname }).toString().trim();
      if (dirty) sha += "-dirty";
    } catch {
      sha = "nogit";
    }
  }
  return `${stamp} · ${sha}`;
}

export default defineConfig({
  plugins: [vue()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __BUILD_VERSION__: JSON.stringify(buildVersion()),
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
