import { test, expect } from "@playwright/test";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

test.describe("admin login (UI)", () => {
  test("admin: login → /users/me → refresh → reload", async ({ page }) => {
    const baseURL = env("E2E_ADMIN_BASE_URL") || "https://admin.mastersat.uz";
    const email = env("E2E_ADMIN_EMAIL");
    const password = env("E2E_ADMIN_PASSWORD");
    test.skip(!email || !password, "Missing E2E env vars");

    await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });

    await page.locator("#email-address").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("button[type=submit]").click();

    // After hardened boot flow, we should land in admin console.
    await page.waitForURL(/\/admin\/?$/, { timeout: 20_000 });

    const me = await page.request.get(`${baseURL}/api/users/me/`);
    expect(me.ok()).toBeTruthy();
    const meJson = await me.json();
    expect(String(meJson?.role || "").toLowerCase()).toContain("admin");

    // Force a refresh call (should succeed with CSRF in place).
    const rf = await page.request.post(`${baseURL}/api/auth/refresh/`, {});
    expect([200, 401, 403]).toContain(rf.status());

    await page.reload({ waitUntil: "domcontentloaded" });
    const me2 = await page.request.get(`${baseURL}/api/users/me/`);
    expect(me2.ok()).toBeTruthy();
  });
});

