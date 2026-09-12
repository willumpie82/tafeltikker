import { test, expect } from "@playwright/test";
import { loginAsChild, loginAsParent } from "./helpers.js";

// Regression test: the parent dashboard used to show one bar per distinct
// word/sentence for the "Woorden"/"Zinnetjes" levels — a specific word only
// ever gets attempted a handful of times, and the pool can grow arbitrarily,
// so that view carried too little signal to be useful. It should show the
// same physical-keyboard (QWERTY row) breakdown as "Letters" does, built
// from the letters that make up whatever was typed.
test("the Woorden dashboard section shows a QWERTY layout, not a per-word list", async ({ page, browser }) => {
  const childPage = await browser.newPage();
  await loginAsChild(childPage, "Sam");
  await childPage.click("#start-typing-button");
  await childPage.waitForSelector("#typing-start-button");
  await childPage.click("#level-picker button:has-text('Woorden')");
  await childPage.click("#typing-count-picker button:has-text('5')");
  await childPage.click("#typing-start-button");

  for (let i = 0; i < 5; i++) {
    await childPage.waitForSelector("#typing-input:not([disabled])");
    const prompt = await childPage.$eval("#typing-prompt", (el) => el.textContent?.trim() ?? "");
    await childPage.type("#typing-input", prompt, { delay: 20 });
    await childPage.waitForTimeout(1200);
  }
  await childPage.close();

  await loginAsParent(page);
  const samCard = page.locator(".child-card", { hasText: "Sam" });
  await samCard.locator('[data-table="level-words"]').click();

  const detail = samCard.locator('[data-table-detail="level-words"]');
  const rows = detail.locator(".fact-bar-row");
  await expect(rows).toHaveCount(3); // top/home/bottom QWERTY rows, same as Letters

  const rowLabels = await Promise.all(
    (await rows.all()).map(async (row) => (await row.locator(".fact-bar-label").allTextContents()).join("")),
  );
  expect(rowLabels).toEqual(["qwertyuiop", "asdfghjkl", "zxcvbnm"]);

  // At least one letter bar reflects real practice instead of every cell
  // reading as untried.
  const nonEmptyBars = detail.locator(".fact-bar:not(.fact-bar-empty)");
  expect(await nonEmptyBars.count()).toBeGreaterThan(0);
});
