import { test, expect } from "@playwright/test";

test.describe("admin: assessments authoring blocked on admin console", () => {
  test("shows banner and hides New set button", async ({ page, context }) => {
    // Simulate admin.* console mode as used by the page.
    await context.addCookies([
      {
        name: "lms_console",
        value: "admin",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");

    // Switch to Assessments tab.
    await page.getByRole("button", { name: /assessments/i }).click();

    await expect(page.getByText(/authoring disabled on this subdomain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /new set/i })).toHaveCount(0);
  });
});

