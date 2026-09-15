import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, PARENT_USERNAME, PARENT_PASSWORD } from "./helpers.js";

// Assumes the page is already logged in as admin — call loginAsAdmin once
// per test, not once per group, since it navigates to /parent.html and a
// second visit while already logged in lands on the dashboard, not the
// login form.
//
// Reads the secret off the network response rather than the DOM: after the
// first group, #group-secret-result is already visible, so waiting on
// ":not([hidden])" for a second group resolves immediately (it's already
// true) instead of waiting for the new value to actually land.
async function createGroupViaAdmin(page: Page, name: string, slug: string): Promise<string> {
  await page.click(".tab-button[data-tab='groups']");
  await page.click("#add-group-button");
  await page.fill("#new-group-name", name);
  await page.fill("#new-group-slug", slug);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/admin/groups") && res.request().method() === "POST"),
    page.click("#add-group-form button[type=submit]"),
  ]);
  const { secret } = await response.json();
  return secret;
}

// These tests intentionally run in order and share state (the klas-geheim
// captured in the first test is reused by later ones — the DB only ever
// stores its hash, so this is the one chance to grab it) — a realistic
// session, not isolated units. See playwright.config.ts: workers:1 and
// fullyParallel:false exist specifically so this ordering is safe.
test.describe.serial("group gate", () => {
  let klasASecret = "";
  let klasBSecret = "";

  test("admin creates two groups to gate against", async ({ page }) => {
    await loginAsAdmin(page);
    klasASecret = await createGroupViaAdmin(page, "Klas Gate A", "klasgatea");
    klasBSecret = await createGroupViaAdmin(page, "Klas Gate B", "klasgateb");
    expect(klasASecret.length).toBeGreaterThan(0);
    expect(klasBSecret.length).toBeGreaterThan(0);
    expect(klasASecret).not.toBe(klasBSecret);
  });

  test("/ still shows the unscoped avatar grid exactly as before", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#view-avatars:not([hidden])");
    await expect(page.locator(".avatar-button", { hasText: "Sam" })).toBeVisible();
    await expect(page.locator(".avatar-button", { hasText: "Robin" })).toBeVisible();
  });

  test("a fresh group's slug shows the gate, not the roster", async ({ page }) => {
    await page.goto("/klasgatea");
    await page.waitForSelector("#view-group-gate:not([hidden])");
    await expect(page.locator("#view-avatars")).toBeHidden();
  });

  test("an unknown slug shows a not-found state instead of the gate", async ({ page }) => {
    await page.goto("/nosuchgroup");
    await page.waitForSelector("#view-group-not-found:not([hidden])");
  });

  test("wrong secret doesn't unlock the gate, correct secret does", async ({ page }) => {
    await page.goto("/klasgatea");
    await page.waitForSelector("#view-group-gate:not([hidden])");

    await page.fill("#group-gate-secret-input", "nope-wrong-secret");
    await page.click("#group-gate-secret-form button[type=submit]");
    await expect(page.locator("#group-gate-secret-error")).toBeVisible();
    await expect(page.locator("#view-avatars")).toBeHidden();

    await page.fill("#group-gate-secret-input", klasASecret);
    await page.click("#group-gate-secret-form button[type=submit]");
    await page.waitForSelector("#view-avatars:not([hidden])");
  });

  test("parent-login with valid credentials but no child in the group shows the exact same error as invalid credentials", async ({
    page,
  }) => {
    await page.goto("/klasgatea");
    await page.waitForSelector("#view-group-gate:not([hidden])");

    await page.fill("#group-gate-parent-username", PARENT_USERNAME);
    await page.fill("#group-gate-parent-password", "totally-wrong-password");
    await page.click("#group-gate-parent-form button[type=submit]");
    const invalidCredsText = await page.locator("#group-gate-parent-error").textContent();
    expect(invalidCredsText).toBeTruthy();

    // Correct credentials, but this parent's children aren't in this group.
    await page.fill("#group-gate-parent-username", PARENT_USERNAME);
    await page.fill("#group-gate-parent-password", PARENT_PASSWORD);
    await page.click("#group-gate-parent-form button[type=submit]");
    await expect(page.locator("#group-gate-parent-error")).toHaveText(invalidCredsText!);
    await expect(page.locator("#view-avatars")).toBeHidden();
  });

  test("'Onthouden' checked persists across a reload, unchecked doesn't", async ({ page }) => {
    await page.goto("/klasgatea");
    await page.waitForSelector("#view-group-gate:not([hidden])");
    await page.fill("#group-gate-secret-input", klasASecret);
    // "Onthouden" left unchecked.
    await page.click("#group-gate-secret-form button[type=submit]");
    await page.waitForSelector("#view-avatars:not([hidden])");

    await page.reload();
    await page.waitForSelector("#view-group-gate:not([hidden])");

    await page.fill("#group-gate-secret-input", klasASecret);
    await page.check("#group-gate-secret-remember");
    await page.click("#group-gate-secret-form button[type=submit]");
    await page.waitForSelector("#view-avatars:not([hidden])");

    await page.reload();
    await page.waitForSelector("#view-avatars:not([hidden])");
  });

  test("a device trusted for group A still gets gated on group B", async ({ page }) => {
    await page.goto("/klasgatea");
    await page.waitForSelector("#view-group-gate:not([hidden])");
    await page.fill("#group-gate-secret-input", klasASecret);
    await page.check("#group-gate-secret-remember");
    await page.click("#group-gate-secret-form button[type=submit]");
    await page.waitForSelector("#view-avatars:not([hidden])");

    await page.goto("/klasgateb");
    await page.waitForSelector("#view-group-gate:not([hidden])");

    await page.fill("#group-gate-secret-input", klasBSecret);
    await page.click("#group-gate-secret-form button[type=submit]");
    await page.waitForSelector("#view-avatars:not([hidden])");
  });
});
