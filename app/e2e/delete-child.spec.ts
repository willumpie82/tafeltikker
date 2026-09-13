import { test, expect } from "@playwright/test";
import { loginAsParent, playMathSessionCorrectly } from "./helpers.js";
import { getChildId } from "./db.js";
import Database from "better-sqlite3";
import { E2E_DB_PATH } from "./constants.js";

test("a parent can delete a child, cascading to their practice history", async ({ page, browser }) => {
  await loginAsParent(page);

  // Add a throwaway third child so this test doesn't touch Sam/Robin, which
  // other specs in this suite depend on.
  await page.click("#add-child-button");
  await page.fill("#new-child-name", "Throwaway");
  await page.fill("#new-child-pin", "9999");
  await page.click("#add-child-form button[type=submit]");
  await expect(page.locator(".child-card", { hasText: "Throwaway" })).toBeVisible();

  // Give it some practice history to prove the cascade actually deletes it,
  // not just the children row itself.
  const childPage = await browser.newPage();
  await childPage.goto("/");
  await childPage.click(".avatar-button:has-text('Throwaway')");
  for (const digit of "9999") {
    await childPage.click(`#pin-pad button:text-is('${digit}')`);
  }
  await childPage.waitForSelector("#view-home:not([hidden])");
  await playMathSessionCorrectly(childPage, [2], 5);
  await childPage.close();

  const throwawayId = getChildId("Throwaway");
  const dbBefore = new Database(E2E_DB_PATH, { readonly: true });
  const attemptsBefore = dbBefore.prepare("select count(*) as n from math_attempts where child_id = ?").get(throwawayId) as { n: number };
  dbBefore.close();
  expect(attemptsBefore.n).toBeGreaterThan(0);

  // Delete it via the parent dashboard's edit form.
  const card = page.locator(".child-card", { hasText: "Throwaway" });
  await card.locator(".child-edit-toggle").click();
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator(".delete-child-button").click();

  await expect(page.locator(".child-card", { hasText: "Throwaway" })).toHaveCount(0);

  const dbAfter = new Database(E2E_DB_PATH, { readonly: true });
  const childRow = dbAfter.prepare("select id from children where id = ?").get(throwawayId);
  const attemptsAfter = dbAfter.prepare("select count(*) as n from math_attempts where child_id = ?").get(throwawayId) as { n: number };
  dbAfter.close();
  expect(childRow).toBeUndefined();
  expect(attemptsAfter.n).toBe(0);
});
