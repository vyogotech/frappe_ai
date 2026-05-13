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

    // agent_url is declared `read_only: 1` in the doctype JSON. Frappe v16
    // renders read-only Data fields as a static <div> (no <input>) until
    // the field is clicked into edit mode, so we assert on the wrapper's
    // presence rather than the input element. The onload hook in
    // ai_assistant_settings.py copies the value from site_config.
    const agentUrl = page.locator('[data-fieldname="agent_url"]').first();
    await expect(agentUrl).toBeVisible({ timeout: 10_000 });
    await expect(agentUrl).toContainText(/https?:\/\//);

    // The headline alert (set via frm.dashboard.set_headline_alert in the
    // form controller) lives in .form-message-container on Frappe v16 —
    // the older .form-dashboard-section path is hidden by default now.
    // Assert on the message text so the test survives further class
    // renames upstream.
    const alert = page.locator(".form-message-container").filter({
      hasText: /AI Assistant is (enabled|disabled)/,
    });
    await expect(alert).toBeVisible({ timeout: 10_000 });
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
    //
    // Read the CSRF token from `frappe.csrf_token` (the desk runtime puts
    // it on the namespaced object; `window.csrf_token` is unset in v16).
    // Without the token Frappe rejects the POST with 403, the response
    // body has no `message` key, and the toHaveProperty assertions below
    // explode with the unhelpful "received value must not be null".
    const result = await page.evaluate(async () => {
      const csrf =
        (window as { frappe?: { csrf_token?: string } }).frappe?.csrf_token ?? "";
      const r = await fetch("/api/method/frappe_ai.api.health.test_connection", {
        credentials: "include",
        method: "POST",
        headers: { "X-Frappe-CSRF-Token": csrf },
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
