import type { Page } from "@playwright/test";

export const PARENT_USERNAME = "admin";
export const PARENT_PASSWORD = "wachtwoord123";
export const CHILDREN = {
  Sam: { name: "Sam", pin: "1234" },
  Robin: { name: "Robin", pin: "4321" },
} as const;

export async function loginAsChild(page: Page, name: keyof typeof CHILDREN) {
  const { pin } = CHILDREN[name];
  await page.goto("/");
  await page.click(`.avatar-button:has-text('${name}')`);
  for (const digit of pin) {
    await page.click(`#pin-pad button:text-is('${digit}')`);
  }
  await page.waitForSelector("#view-home:not([hidden])");
}

export async function loginAsParent(page: Page, username = PARENT_USERNAME, password = PARENT_PASSWORD) {
  await page.goto("/parent.html");
  await page.fill("#login-username", username);
  await page.fill("#login-password", password);
  await page.click("#login-form button[type=submit]");
  await page.waitForSelector(".child-card");
}

/** Answers the current Makkelijk (multiple choice) math question correctly. */
export async function answerMathQuestionCorrectly(page: Page) {
  await page.waitForSelector("#math-options button", { timeout: 5000 });
  const qText = await page.$eval("#math-question", (el) => el.textContent ?? "");
  const match = qText.match(/(\d+)\s*×\s*(\d+)/);
  if (!match) throw new Error(`Could not parse math question: "${qText}"`);
  const answer = String(Number(match[1]) * Number(match[2]));

  const options = await page.$$("#math-options button");
  for (const option of options) {
    if ((await option.textContent())?.trim() === answer) {
      await option.click();
      return;
    }
  }
  throw new Error(`Correct answer ${answer} not found among options for "${qText}"`);
}

/** Answers the current Makkelijk (multiple choice) math question with a deliberately wrong option. */
export async function answerMathQuestionIncorrectly(page: Page) {
  await page.waitForSelector("#math-options button", { timeout: 5000 });
  const qText = await page.$eval("#math-question", (el) => el.textContent ?? "");
  const match = qText.match(/(\d+)\s*×\s*(\d+)/);
  if (!match) throw new Error(`Could not parse math question: "${qText}"`);
  const answer = String(Number(match[1]) * Number(match[2]));

  const options = await page.$$("#math-options button");
  for (const option of options) {
    if ((await option.textContent())?.trim() !== answer) {
      await option.click();
      return;
    }
  }
  throw new Error(`No wrong option found among options for "${qText}"`);
}

/** Plays a full Makkelijk math session on the given table(s), answering every question correctly. */
export async function playMathSessionCorrectly(page: Page, tables: number[], count: 5 | 10 | 20) {
  await page.click("#start-math-button");
  for (const table of tables) {
    await page.click(`#table-picker button:text-is('${table}')`);
  }
  await page.click(`#count-picker button:text-is('${count}')`);
  await page.click(".difficulty-button:has-text('Makkelijk')");
  await page.click("#math-start-button");
  await page.waitForSelector("#view-math-exercise:not([hidden])");

  // Wrong final answers get requeued, but every answer here is correct, so
  // exactly `count` correct answers always finishes the session.
  for (let i = 0; i < count; i++) {
    await answerMathQuestionCorrectly(page);
    await page.waitForTimeout(1100); // AUTO_ADVANCE_MS + margin
  }
  await page.waitForSelector("#view-math-summary:not([hidden])", { timeout: 5000 });
  await page.click("#math-summary-done");
  await page.waitForSelector("#view-home:not([hidden])");
}

/** Plays a full Gemiddeld/Moeilijk (numpad) math session, answering every question correctly on the first try. */
export async function playMathSessionOnNumpad(page: Page, tables: number[], count: 5 | 10 | 20, difficultyLabel: "Gemiddeld" | "Moeilijk") {
  await page.click("#start-math-button");
  for (const table of tables) {
    await page.click(`#table-picker button:text-is('${table}')`);
  }
  await page.click(`#count-picker button:text-is('${count}')`);
  await page.click(`.difficulty-button:has-text('${difficultyLabel}')`);
  await page.click("#math-start-button");
  await page.waitForSelector("#view-math-exercise:not([hidden])");

  for (let i = 0; i < count; i++) {
    const qText = await page.$eval("#math-question", (el) => el.textContent ?? "");
    const match = qText.match(/(\d+)\s*×\s*(\d+)/);
    if (!match) throw new Error(`Could not parse math question: "${qText}"`);
    const answer = String(Number(match[1]) * Number(match[2]));
    for (const digit of answer) {
      await page.click(`#math-pad button:text-is('${digit}')`);
    }
    await page.click("#math-pad .submit-button");
    await page.waitForTimeout(1100); // AUTO_ADVANCE_MS + margin
  }
  await page.waitForSelector("#view-math-summary:not([hidden])", { timeout: 5000 });
  await page.click("#math-summary-done");
  await page.waitForSelector("#view-home:not([hidden])");
}
