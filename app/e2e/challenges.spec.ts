import { test, expect } from "@playwright/test";
import { loginAsChild, loginAsParent, playMathSessionCorrectly } from "./helpers.js";
import { getChildId, getLatestSessionId, setSessionDurationSeconds } from "./db.js";

// These tests intentionally run in order and share state (a challenge
// created in one test is played out and reset in later ones) — a realistic
// session, not isolated units. See playwright.config.ts: workers:1 and
// fullyParallel:false exist specifically so this ordering is safe.
test.describe.serial("challenge module", () => {
  test("a table_confidence challenge starts incomplete on an untouched table", async ({ page }) => {
    await loginAsParent(page);
    const samCard = page.locator(".child-card", { hasText: "Sam" });

    await samCard.locator(".challenge-add-toggle").click();
    await samCard.locator(".challenge-type-select").selectOption("table_confidence");
    await samCard.locator(".challenge-table-button", { hasText: /^7$/ }).click();
    await samCard.locator(".challenge-target-confidence").fill("60");
    await samCard.locator(".challenge-sticker-button[data-sticker='cookie']").click();
    await samCard.locator("form.challenge-form button[type=submit]").click();

    const row = samCard.locator(".challenge-row", { hasText: "Tafel 7" });
    await expect(row).toContainText("0/60%");
    await expect(row.locator(".status-badge")).toHaveCount(0);
  });

  test("playing correctly on the targeted table completes it", async ({ page, browser }) => {
    const childPage = await browser.newPage();
    await loginAsChild(childPage, "Sam");
    await playMathSessionCorrectly(childPage, [7], 20);
    await childPage.close();

    await loginAsParent(page);
    const samCard = page.locator(".child-card", { hasText: "Sam" });
    const row = samCard.locator(".challenge-row", { hasText: "Tafel 7" });
    await expect(row).toContainText("100/60%");
    await expect(row.locator(".status-badge")).toHaveText("Behaald");
  });

  test("the child-side widget shows the completed challenge on home and settings screens", async ({ page }) => {
    await loginAsChild(page, "Sam");

    const widget = page.locator("#challenge-widget");
    await expect(widget).toBeVisible();
    await expect(widget).toContainText("Behaald");

    await page.click("#start-math-button");
    await expect(widget).toBeVisible();

    await page.click("#math-settings-back");
    await page.click("#start-typing-button");
    await expect(widget).toBeVisible();
  });

  test("tapping a challenge chip reveals what it requires and the reward, and tapping again collapses it", async ({ page }) => {
    await loginAsChild(page, "Sam");

    const chip = page.locator(".challenge-chip").first();
    const detail = chip.locator(".challenge-chip-detail");
    await expect(detail).toBeHidden();

    await chip.click();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(/tafel 7/i);
    await expect(detail).toContainText("Koekje"); // the sticker chosen in the first test

    await chip.click();
    await expect(detail).toBeHidden();
  });

  test("resetting a table_confidence challenge re-completes immediately, since confidence isn't time-windowed", async ({ page }) => {
    // Documents real (if slightly surprising) current behavior: unlike
    // time_played, table_confidence progress is an all-time rolling
    // average, not scoped to after the challenge's startedAt. Resetting
    // clears completedAt, but the very next read recomputes from the same
    // historical attempts and instantly re-qualifies. Worth a product
    // decision later; for now this test pins the actual behavior so a
    // future change here is a deliberate one, not an accident.
    await loginAsParent(page);
    const samCard = page.locator(".child-card", { hasText: "Sam" });
    const row = samCard.locator(".challenge-row", { hasText: "Tafel 7" });

    await row.locator(".challenge-reset-button").click();
    await expect(row.locator(".status-badge")).toHaveText("Behaald");
  });

  test("a time_played challenge only counts sessions started after it began, and completes once the target is reached", async ({ page, browser }) => {
    await loginAsParent(page);
    const robinCard = page.locator(".child-card", { hasText: "Robin" });

    await robinCard.locator(".challenge-add-toggle").click();
    // type select defaults to time_played
    await robinCard.locator(".challenge-counts-math").check();
    await robinCard.locator(".challenge-target-minutes").fill("30");
    await robinCard.locator(".challenge-sticker-button[data-sticker='award_bronze']").click();
    await robinCard.locator("form.challenge-form button[type=submit]").click();

    const row = robinCard.locator(".challenge-row", { hasText: "Sommen" });
    await expect(row).toContainText("0/30 min");

    const childPage = await browser.newPage();
    await loginAsChild(childPage, "Robin");
    await childPage.click("#start-math-button");
    await childPage.click("#table-picker button:text-is('1')");
    await childPage.click("#count-picker button:text-is('5')");
    await childPage.click(".difficulty-button:has-text('Makkelijk')");
    await childPage.click("#math-start-button");
    await childPage.waitForSelector("#view-math-exercise:not([hidden])");

    const robinId = getChildId("Robin");
    const sessionId = getLatestSessionId(robinId);

    childPage.once("dialog", (dialog) => dialog.accept()); // the "Wil je nu al stoppen?" exit confirmation
    await childPage.click("#math-exercise-back"); // ends the session -> /finish (real, tiny duration)
    await childPage.waitForSelector("#view-home:not([hidden])");
    await childPage.close();

    // Overwrite the just-finished session's duration to simulate Robin
    // having played for well over 30 minutes, instead of the test actually
    // waiting that long — the feature under test is the progress math
    // (and the >= startedAt windowing), not the wall clock. Must happen
    // after /finish, which otherwise overwrites duration with the real
    // elapsed time itself.
    setSessionDurationSeconds(sessionId, 40 * 60);

    await page.reload();
    await expect(row).toContainText("min");
    await expect(row.locator(".status-badge")).toHaveText("Behaald");
  });

  test("resetting a time_played challenge restarts its counter from zero", async ({ page }) => {
    await loginAsParent(page);
    const robinCard = page.locator(".child-card", { hasText: "Robin" });
    const row = robinCard.locator(".challenge-row", { hasText: "Sommen" });

    await row.locator(".challenge-reset-button").click();
    await expect(row.locator(".status-badge")).toHaveCount(0);
    await expect(row).toContainText("0/30 min");
  });
});
