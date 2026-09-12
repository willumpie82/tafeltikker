import { test, expect } from "@playwright/test";
import { loginAsChild } from "./helpers.js";

// Regression test for a real bug: an expired/invalid session mid-exercise
// (in practice this happened because a dev server restart invalidated an
// already-open browser session) silently read as "wrong answer" with
// "Het antwoord is undefined" as the reported correct answer, since the
// client never checked whether the attempt request actually succeeded
// before reading result.correct off it.
test("a session that goes invalid mid-exercise shows a clear message instead of a bogus wrong answer", async ({ page, context }) => {
  await loginAsChild(page, "Sam");
  await page.click("#start-math-button");
  await page.click("#table-picker button:text-is('3')");
  await page.click("#count-picker button:text-is('5')");
  await page.click(".difficulty-button:has-text('Makkelijk')");
  await page.click("#math-start-button");
  await page.waitForSelector("#view-math-exercise:not([hidden])");

  // Simulate the session becoming invalid mid-exercise (e.g. a server
  // restart with a fresh signing key, or a normal cookie expiry) without
  // the page knowing yet.
  await context.clearCookies();

  const dialogPromise = page.waitForEvent("dialog");
  const options = await page.$$("#math-options button");
  await options[0].click();

  const dialog = await dialogPromise;
  const dialogMessage = dialog.message();
  await dialog.accept();

  await page.waitForURL("/", { timeout: 5000 });
  expect(dialogMessage).toContain("uitgelogd");

  // Never got a bogus "wrong answer" feedback message out of this.
  expect(await page.isVisible("#math-feedback")).toBe(false);
});
