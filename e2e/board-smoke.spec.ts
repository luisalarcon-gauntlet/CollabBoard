/**
 * Smoke test: Navigate to board page and verify no critical console errors.
 */

import { test, expect } from "@playwright/test";

test("board page loads without critical console errors", async ({ page }) => {
  const boardId = process.env.E2E_BOARD_ID ?? "00000000-0000-0000-0000-000000000000";
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  const response = await page.goto(`http://127.0.0.1:3000/board/${boardId}`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  expect(response?.status()).toBeLessThan(500);

  const critical = errors.filter(
    (m) =>
      !m.includes("Warning:") &&
      !m.includes("Yjs was already imported") &&
      !m.includes("Clerk") &&
      !m.includes("script-src") &&
      !m.includes("default-src") &&
      !m.includes("Content-Security-Policy")
  );

  expect(critical).toEqual([]);
});
