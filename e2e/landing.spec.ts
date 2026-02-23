/**
 * E2E tests for the landing page (public, no auth required).
 */

import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("displays CollabBoard branding and auth buttons", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "CollabBoard" })).toBeVisible();
    await expect(page.getByText("Enterprise collaborative whiteboard")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
  });

  test("has no critical console errors on load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");

    const isAllowed = (m: string) =>
      m.includes("Warning:") ||
      m.includes("act(") ||
      m.includes("React") ||
      m.includes("hydration") ||
      m.includes("Clerk");
    const critical = consoleErrors.filter((m) => !isAllowed(m));

    expect(critical).toEqual([]);
  });
});
