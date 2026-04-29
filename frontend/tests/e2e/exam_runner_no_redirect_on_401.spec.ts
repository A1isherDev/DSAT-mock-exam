import { test, expect } from "@playwright/test";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

test.describe("exam runner: no redirect kick-outs", () => {
  test("stays on /exam/* when refresh fails with 401", async ({ page }) => {
    // This UI-level test requires the exam route to exist in the target deployment.
    // Enable explicitly in environments where /exam/* is reachable.
    test.skip(env("E2E_EXAM_UI") !== "1", "Set E2E_EXAM_UI=1 to enable exam UI tests");

    const attemptId = 123;
    const examPath = `/exam/${attemptId}`;

    // Simulate auth expiry: status call returns 401, refresh also returns 401.
    await page.route(`**/api/exams/attempts/${attemptId}/status/`, async (route) => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Unauthorized" }) });
    });
    await page.route("**/api/auth/refresh/", async (route) => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Unauthorized" }) });
    });

    await page.goto(examPath);

    // Give the page time to issue the failing requests and render error UI.
    await page.waitForTimeout(1500);

    // Critical assertion: do NOT redirect to /login (no "kick-out").
    await expect(page).toHaveURL(new RegExp(`/exam/${attemptId}`));

    // We should surface a retry/reconnect state instead.
    await expect(page.getByText(/reconnect|retry|re-authentication/i)).toBeVisible();
  });
});

