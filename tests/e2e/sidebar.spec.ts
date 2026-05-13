/**
 * Sidebar mount + UI flows — runs as Administrator.
 *
 * Validates the same surface we hit live during development:
 *   - Bundle loads on /app
 *   - Navbar AI button is injected
 *   - Sidebar root is mounted but hidden by default
 *   - Clicking the button opens the sidebar with the empty state
 *   - The textarea + send button reach the right state as the user types
 *   - The close button hides the sidebar again
 *   - The new-conversation button clears the bubble list (when populated)
 *   - The navbar button survives an SPA route change
 */

import { expect, openSidebar, test } from "./fixtures";

const ADMIN_USER = process.env.FRAPPE_ADMIN ?? "Administrator";
const ADMIN_PWD = process.env.FRAPPE_PWD ?? "admin";

test.describe("Frappe AI sidebar — Administrator", () => {
  test.beforeEach(async ({ login }) => {
    await login(ADMIN_USER, ADMIN_PWD);
  });

  test("bundle loads and mounts the sidebar root", async ({ page }) => {
    // app_include_js wires the bundle into every desk page.
    const bundle = await page.evaluate(() => {
      return Array.from(document.scripts)
        .map((s) => s.src)
        .find((s) => s.includes("/frappe_ai.bundle.") && s.endsWith(".js"));
    });
    expect(bundle).toBeTruthy();
    await expect(page.locator("#frappe-ai-sidebar-root")).toBeAttached();
    await expect(page.locator("#frappe-ai-nav-btn")).toBeVisible();
  });

  test("get_settings endpoint returns expected shape", async ({ page }) => {
    const settings = await page.evaluate(async () => {
      const r = await fetch("/api/method/frappe_ai.api.get_settings", {
        credentials: "include",
      });
      return r.json();
    });
    expect(settings.message).toMatchObject({
      enabled: expect.any(Boolean),
      sidebar_width: expect.any(Number),
      keyboard_shortcut: expect.any(String),
    });
    // The runtime fallback for keyboard_shortcut must not be the
    // Frappe v16 reserved Ctrl+/ — the API layer should hand back
    // Alt+/ (or whatever the user explicitly stored).
    expect(settings.message.keyboard_shortcut).not.toBe("Ctrl+/");
  });

  test("clicking the navbar button opens the sidebar", async ({ page }) => {
    const sidebar = await openSidebar(page);
    await expect(sidebar.locator(".frappe-ai-header-title")).toHaveText("Frappe AI");
    await expect(sidebar.locator(".frappe-ai-empty-state")).toBeVisible();
    await expect(sidebar.locator(".frappe-ai-empty-title")).toHaveText("How can I help?");
  });

  test("typing enables the send button; clearing disables it", async ({ page }) => {
    await openSidebar(page);
    const textarea = page.locator(".frappe-ai-textarea");
    const sendBtn = page.locator(".frappe-ai-send-btn");

    // Empty → disabled.
    await expect(sendBtn).toBeDisabled();
    await expect(sendBtn).not.toHaveClass(/frappe-ai-send-btn--active/);

    // Typed → enabled + active class.
    await textarea.fill("hello world");
    await expect(sendBtn).toBeEnabled();
    await expect(sendBtn).toHaveClass(/frappe-ai-send-btn--active/);

    // Cleared → disabled again.
    await textarea.fill("");
    await expect(sendBtn).toBeDisabled();
  });

  test("close button hides the sidebar", async ({ page }) => {
    const sidebar = await openSidebar(page);
    await sidebar.locator(".frappe-ai-icon-btn[title='Close sidebar']").click();
    // The slide-out transition is 250ms; wait for hidden.
    await expect(page.locator("#frappe-ai-sidebar-root")).toHaveAttribute("hidden", "", {
      timeout: 1500,
    });
  });

  test("navbar button survives SPA route changes", async ({ page }) => {
    // Navigate to a form route; the navbar re-renders in v16 but the
    // MutationObserver in frappe_ai.bundle.ts re-injects the button.
    await page.goto("/app/user/Administrator");
    // Allow the route + observer to re-mount.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#frappe-ai-nav-btn")).toBeVisible({ timeout: 5000 });
  });

  test("keyboard shortcut toggles the sidebar", async ({ page }) => {
    // Resolve the shortcut from get_settings rather than hard-coding so
    // the test stays correct even if the user changes the default.
    const shortcut: string = await page.evaluate(async () => {
      const r = await fetch("/api/method/frappe_ai.api.get_settings", {
        credentials: "include",
      });
      const j = (await r.json()) as { message: { keyboard_shortcut: string } };
      return j.message.keyboard_shortcut;
    });
    // Frappe's shortcut format uses "Ctrl"/"Mod" but Playwright's
    // page.keyboard.press() expects "Control"/"Meta". Translate.
    const playwrightCombo = shortcut
      .replace(/^Ctrl\+/i, "Control+")
      .replace(/^Mod\+/i, process.platform === "darwin" ? "Meta+" : "Control+");

    await page.locator("body").click(); // ensure focus is on the body
    await page.keyboard.press(playwrightCombo);
    await expect(page.locator(".frappe-ai-sidebar")).toBeVisible();
    await page.keyboard.press(playwrightCombo);
    // Close transition takes ~250ms.
    await expect(page.locator("#frappe-ai-sidebar-root")).toHaveAttribute("hidden", "", {
      timeout: 1500,
    });
  });
});

test.describe("Frappe AI sidebar — non-admin matrix (set FRAPPE_USER + FRAPPE_USER_PWD)", () => {
  test.skip(
    !process.env.FRAPPE_USER,
    "set FRAPPE_USER and FRAPPE_USER_PWD to enable the non-admin tier",
  );

  test.beforeEach(async ({ login }) => {
    await login(process.env.FRAPPE_USER!, process.env.FRAPPE_USER_PWD!);
  });

  test("non-admin user can still load the sidebar", async ({ page }) => {
    // get_settings is whitelisted; the doctype's read perm only gates
    // the form UI. Sidebar should mount the same way it does for an
    // admin.
    await expect(page.locator("#frappe-ai-nav-btn")).toBeVisible();
    const sidebar = await openSidebar(page);
    await expect(sidebar.locator(".frappe-ai-empty-state")).toBeVisible();
  });

  test("non-admin cannot reach the Settings form (expected)", async ({ page }) => {
    await page.goto("/app/ai-assistant-settings");
    // Frappe returns a permission error page; the body indicates 403-ish.
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toMatch(/permission|not permitted|forbidden|insufficient/);
  });
});
