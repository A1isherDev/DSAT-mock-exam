import { test, expect } from "@playwright/test";

test("admin relogin does not lose sets due to subject cookie drift", async ({ page }) => {
  // This test assumes the environment provides a way to log in non-interactively.
  // If you use a real login form, fill credentials via env vars.
  const email = process.env.E2E_ADMIN_EMAIL || "";
  const password = process.env.E2E_ADMIN_PASSWORD || "";
  test.skip(!email || !password, "E2E credentials not configured");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await page.goto("/builder/sets");
  await expect(page.getByText(/Assessment sets/i)).toBeVisible();

  // Simulate stale cookie drift: set an invalid lms_subject cookie on the domain.
  await page.context().addCookies([
    { name: "lms_subject", value: "math", domain: ".mastersat.uz", path: "/" },
  ]);

  // Reload should still show sets (we no longer filter by lms_subject for global staff).
  await page.reload();
  await expect(page.getByText(/Assessment sets/i)).toBeVisible();
});

