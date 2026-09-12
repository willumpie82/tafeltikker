import { test, expect } from "@playwright/test";
import { loginAsChild, answerMathQuestionCorrectly, answerMathQuestionIncorrectly } from "./helpers.js";

test("a wrong answer that gets corrected on retry is not reported as 'in one go'", async ({ page }) => {
  await loginAsChild(page, "Sam");
  await page.click("#start-math-button");
  await page.click("#table-picker button:text-is('3')");
  await page.click("#count-picker button:text-is('5')");
  await page.click(".difficulty-button:has-text('Makkelijk')");
  await page.click("#math-start-button");
  await page.waitForSelector("#view-math-exercise:not([hidden])");

  // Get the very first question wrong on purpose — it gets requeued to
  // reappear later in the session rather than ending it.
  await answerMathQuestionIncorrectly(page);
  await page.waitForTimeout(1100); // AUTO_ADVANCE_MS + margin

  // Answer everything else correctly, including the requeued retry, until
  // the session ends.
  for (let i = 0; i < 20; i++) {
    if (await page.isVisible("#view-math-summary:not([hidden])")) break;
    await answerMathQuestionCorrectly(page);
    await page.waitForTimeout(1100);
  }
  await page.waitForSelector("#view-math-summary:not([hidden])", { timeout: 5000 });

  // Regression test for a real bug: the summary claimed "alle sommen in één
  // keer goed" (all in one go) even though one fact needed a second try
  // after an earlier wrong guess. Root cause was that the per-fact "which
  // try was this" count reset on every new appearance of a requeued
  // question, instead of accumulating across the whole session.
  const summary = await page.textContent("#math-summary-heading");
  expect(summary).not.toContain("in één keer goed");
  expect(summary).toContain("Gemiddelde score");
});
