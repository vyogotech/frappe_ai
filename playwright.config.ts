import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — runs against a live Frappe site.
 *
 * Environment variables:
 *   FRAPPE_BASE_URL   default http://dev.localhost:8080
 *   FRAPPE_ADMIN      default "Administrator"
 *   FRAPPE_PWD        default "admin"
 *   FRAPPE_USER       optional non-admin username (matrix tier picks
 *                     this up; left unset, the non-admin spec is skipped)
 *   FRAPPE_USER_PWD   optional non-admin password
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false, // shared Frappe state — keep tests sequential
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.FRAPPE_BASE_URL ?? "http://dev.localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // Frappe sets HttpOnly cookies — let Playwright manage them.
    storageState: undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
