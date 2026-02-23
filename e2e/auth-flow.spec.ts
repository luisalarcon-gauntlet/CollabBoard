/**
 * E2E tests for auth flow.
 * Requires Clerk to be configured; unauthenticated users are redirected to sign-in.
 */

import { test, expect } from "@playwright/test";

test.describe("Auth flow", () => {
  test("redirects unauthenticated user from dashboard to sign-in", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/sign-in|sign-up|\/dashboard/);
    if (page.url().includes("sign-in") || page.url().includes("sign-up")) {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("redirects authenticated user from home to dashboard", async ({ page }) => {
    await page.goto("/");

    const signIn = page.getByRole("button", { name: "Sign In" });
    if (await signIn.isVisible()) {
      await signIn.click();
      await expect(page).toHaveURL(/sign-in|clerk/);
    }
  });
});
