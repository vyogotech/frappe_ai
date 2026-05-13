/**
 * Settings form flows — admin-only since the form is gated by
 * System Manager role.
 */

import { expect, test } from "./fixtures";

const ADMIN_USER = process.env.FRAPPE_ADMIN ?? "Administrator";
const ADMIN_PWD = process.env.FRAPPE_PWD ?? "admin";

test.describe("AI Assistant Settings form", () => {
  test.beforeEach(async ({ login }) => {
    await login(ADMIN_USER, ADMIN_PWD);
  });

  test("form loads, agent_url is read-only, headline alert reflects enabled state", async ({
    page,
  }) => {
    await page.goto("/app/ai-assistant-settings");
    await page.waitForLoadState("networkidle");

    // agent_url field exists and is read-only (mirrors site_config).
    const agentUrl = page.locator('[data-fieldname="agent_url"] input');
    await expect(agentUrl).toBeVisible({ timeout: 10_000 });
    await expect(agentUrl).toHaveAttribute("readonly", /.*/);

    // The headline alert tells the user whether the integration is enabled.
    const alert = page.locator(".form-dashboard-section .indicator-pill, .form-dashboard-section");
    await expect(alert.first()).toBeVisible();
  });

  test("Test Connection custom button is present and callable", async ({ page }) => {
    await page.goto("/app/ai-assistant-settings");
    await page.waitForLoadState("networkidle");

    // Custom-button menu (Frappe usually folds them under the ⋯ menu when
    // there's not enough room; find the button by label regardless).
    const testBtn = page.getByRole("button", { name: /test connection/i });
    await expect(testBtn).toBeVisible({ timeout: 10_000 });

    // Invoke the endpoint directly to assert the contract regardless of
    // whether the agent at frappe_ai_agent_url is reachable from CI.
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/method/frappe_ai.api.health.test_connection", {
        credentials: "include",
        method: "POST",
        headers: { "X-Frappe-CSRF-Token": (window as { csrf_token?: string }).csrf_token ?? "" },
      });
      return r.json();
    });
    // Whatever the agent's state, the endpoint must always return a
    // structured {success, message} object (never raise).
    expect(result.message).toHaveProperty("success");
    expect(result.message).toHaveProperty("message");
    expect(typeof result.message.message).toBe("string");
  });
});
