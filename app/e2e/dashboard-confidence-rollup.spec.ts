import { test, expect } from "@playwright/test";
import { loginAsChild, loginAsParent } from "./helpers.js";

// Regression test for a real bug: the per-table rollup on the parent
// dashboard showed plain accuracy ("Tafel 3: 5/5 (100%)") while the
// per-fact bars underneath it showed confidence (accuracy × speed) — so a
// table answered correctly but slowly could read "100%" at a glance while
// every bar below it was orange or red once expanded. The rollup should
// show the same confidence measure the bars do.
test("a table answered correctly but slowly shows reduced confidence in the rollup, not 100%", async ({ page, browser }) => {
  test.setTimeout(60000); // deliberately answers slowly, several real seconds per question

  const childPage = await browser.newPage();
  await loginAsChild(childPage, "Sam");
  await childPage.click("#start-math-button");
  await childPage.click("#table-picker button:text-is('9')"); // a table untouched by other specs
  await childPage.click("#count-picker button:text-is('5')");
  await childPage.click(".difficulty-button:has-text('Makkelijk')");
  await childPage.click("#math-start-button");
  await childPage.waitForSelector("#view-math-exercise:not([hidden])");

  for (let i = 0; i < 5; i++) {
    await childPage.waitForSelector("#math-options button", { timeout: 5000 });
    // A real, well-past-the-3s-"confident pace" delay before answering, on
    // every question — no shortcuts, so the resulting avgElapsedMs is
    // unambiguously above the speed-penalty threshold.
    await childPage.waitForTimeout(6000);

    const qText = await childPage.$eval("#math-question", (el) => el.textContent ?? "");
    const match = qText.match(/(\d+)\s*×\s*(\d+)/)!;
    const answer = String(Number(match[1]) * Number(match[2]));
    const options = await childPage.$$("#math-options button");
    for (const option of options) {
      if ((await option.textContent())?.trim() === answer) {
        await option.click();
        break;
      }
    }
    await childPage.waitForTimeout(1100); // AUTO_ADVANCE_MS + margin
  }

  await childPage.waitForSelector("#view-math-summary:not([hidden])", { timeout: 5000 });
  await childPage.close();

  await loginAsParent(page);
  const samCard = page.locator(".child-card", { hasText: "Sam" });
  const row = samCard.locator(".table-accuracy-row", { hasText: "Tafel 9" });

  await expect(row).toContainText("5/5 goed"); // perfect accuracy...
  const summaryText = await row.locator(".table-accuracy-summary").textContent();
  const confidenceMatch = summaryText?.match(/(\d+)% zelfvertrouwen/);
  expect(confidenceMatch).not.toBeNull();
  // ...but confidence is pulled down by the slow pace, nowhere near 100%.
  expect(Number(confidenceMatch![1])).toBeLessThan(80);
});
