/**
 * Test fixtures — shared login + sidebar helpers across the E2E suite.
 *
 * Login uses Frappe's /api/method/login JSON endpoint rather than driving
 * the HTML form, which:
 *   1. Survives Frappe's per-version form-markup changes (v15 used
 *      input[name="usr"], v16 uses input#login_email + JS submit).
 *   2. Is ~5× faster — no form render, no Vue initialisation wait.
 *   3. Sets the same `sid` cookie the form does, so everything that
 *      reads it (the bundle, frappe.session, our chat endpoints)
 *      sees the user logged in identically.
 *
 * After login the fixture navigates to /app and waits for the sidebar
 * root to attach — confirming the bundle's `app_ready` hook fired.
 */

import { test as base, expect, type Page } from "@playwright/test";

type LoginFn = (user: string, password: string) => Promise<void>;

export const test = base.extend<{ login: LoginFn }>({
  login: async ({ page, request }, use) => {
    const loginFn: LoginFn = async (user, password) => {
      // Authenticate via the JSON API.
      const resp = await request.post("/api/method/login", {
        form: { usr: user, pwd: password },
      });
      expect(resp.ok(), `login failed for ${user}: HTTP ${resp.status()}`).toBeTruthy();

      // Transfer the auth cookies from the APIRequestContext to the
      // browser context so subsequent page.goto() sends `sid` etc.
      const cookies = (await request.storageState()).cookies;
      await page.context().addCookies(cookies);

      // /app issues a 301 → /desk; navigate directly to /desk to avoid
      // a redirect round-trip Playwright sometimes mishandles.
      // `domcontentloaded` (not the default `load`) is needed because
      // the socketio polling fallback keeps the network busy forever
      // when no socketio server is running.
      await page.goto("/desk", { waitUntil: "domcontentloaded" });
      // Wait directly for the bundle's effect — the sidebar root
      // element only appears after `onFrappeReady()` fires + settings
      // load + the bundle mounts.
      await expect(page.locator("#frappe-ai-sidebar-root")).toBeAttached({ timeout: 90_000 });
    };
    await use(loginFn);
  },
});

export { expect } from "@playwright/test";

/**
 * Opens the AI sidebar by clicking the navbar toggle button.
 * Returns the sidebar locator for further assertions.
 */
export async function openSidebar(page: Page) {
  const btn = page.locator("#frappe-ai-nav-btn");
  await expect(btn).toBeVisible();
  await btn.click();
  const sidebar = page.locator(".frappe-ai-sidebar");
  await expect(sidebar).toBeVisible();
  return sidebar;
}
