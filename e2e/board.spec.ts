/**
 * E2E tests for the whiteboard.
 * Requires authentication and an existing board.
 * Run with: E2E_BOARD_ID=<uuid> npx playwright test e2e/board.spec.ts
 */

import { test, expect } from "@playwright/test";

const E2E_BOARD_ID = process.env.E2E_BOARD_ID;

test.describe("Board page", () => {
  test.skip(!E2E_BOARD_ID, "E2E_BOARD_ID not set — skipping authenticated board tests");

  test("loads whiteboard and toolbar when board exists", async ({ page }) => {
    await page.goto(`/board/${E2E_BOARD_ID}`);

    await expect(page.getByRole("link", { name: "Back to Dashboard" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Sticky" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rectangle" })).toBeVisible();
  });

  test("adds sticky note when clicking Sticky button", async ({ page }) => {
    await page.goto(`/board/${E2E_BOARD_ID}`);

    await page.getByRole("button", { name: "Sticky" }).click();

    await expect(page.getByText("New note")).toBeVisible({ timeout: 5000 });
  });

  test("has no critical console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto(`/board/${E2E_BOARD_ID}`);
    await page.getByRole("button", { name: "Sticky" }).click();
    await expect(page.getByText("New note")).toBeVisible({ timeout: 5000 });

    const critical = errors.filter(
      (m) =>
        !m.includes("Warning:") &&
        !m.includes("act(") &&
        !m.includes("Yjs was already imported")
    );

    expect(critical).toEqual([]);
  });
});
