/**
 * Test fixtures — shared login + sidebar helpers across the E2E suite.
 *
 * The `login` fixture POSTs to /api/method/login with credentials and
 * leaves the session cookie on the page context, then navigates to /app.
 * Tests can `await login("Administrator", "admin")` or rely on the
 * default admin fixture.
 */

import { test as base, expect, type Page } from "@playwright/test";

type LoginFn = (user: string, password: string) => Promise<void>;

export const test = base.extend<{ login: LoginFn }>({
  login: async ({ page }, use) => {
    const loginFn: LoginFn = async (user, password) => {
      await page.goto("/login");
      await page.fill('input[name="usr"]', user);
      await page.fill('input[name="pwd"]', password);
      await page.click('.btn-login, button[type="submit"]');
      await page.waitForURL((url) => url.pathname.startsWith("/app") || url.pathname === "/desk");
      // The bundle's `app_ready` hook mounts the sidebar root. Frappe
      // dispatches that event on /app routes (and on /desk too), but the
      // form/list-view pages take a tick to wire it up. Navigate to /app
      // explicitly so we always land on the same baseline.
      if (!page.url().includes("/app")) {
        await page.goto("/app");
      }
      await expect(page.locator("#frappe-ai-sidebar-root")).toBeAttached({ timeout: 15_000 });
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
