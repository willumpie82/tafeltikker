import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, PARENT_USERNAME, PARENT_PASSWORD } from "./helpers.js";
import { expireGroupInvite } from "./db.js";

const GROUP_NAME = "Klas Invite";
const GROUP_SLUG = "klasinvite";

async function createGroupViaAdmin(page: Page, name: string, slug: string): Promise<number> {
  await page.click(".tab-button[data-tab='groups']");
  await page.click("#add-group-button");
  await page.fill("#new-group-name", name);
  await page.fill("#new-group-slug", slug);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/admin/groups") && res.request().method() === "POST"),
    page.click("#add-group-form button[type=submit]"),
  ]);
  const { id } = await response.json();
  return id;
}

async function createGroupInvite(page: Page, childName: string): Promise<{ token: string; url: string }> {
  const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: GROUP_NAME }) });
  await groupRow.locator(".group-invite-child-name").fill(childName);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/invites") && res.request().method() === "POST"),
    groupRow.locator(".group-invite-form button[type=submit]").click(),
  ]);
  return response.json();
}

async function pickFirstAvatarAndSetPin(page: Page, pin: string) {
  await page.locator("#group-invite-new-child-avatar-picker .avatar-picker-button").first().click();
  await page.fill("#group-invite-new-child-pin", pin);
  await page.click("#group-invite-new-child-form button[type=submit]");
}

// These tests intentionally run in order and share the group + invites
// created in the first test — a realistic session, not isolated units.
// See playwright.config.ts: workers:1 and fullyParallel:false exist
// specifically so this ordering is safe.
test.describe.serial("group invite accept flow", () => {
  let newChildInvite: { token: string; url: string };
  let confirmInvite: { token: string; url: string };
  let declineInvite: { token: string; url: string };
  let tim1Invite: { token: string; url: string };
  let tim2Invite: { token: string; url: string };
  let alreadyLoggedInInvite: { token: string; url: string };

  test("admin creates a group and several invites for the flow tests", async ({ page }) => {
    await loginAsAdmin(page);
    await createGroupViaAdmin(page, GROUP_NAME, GROUP_SLUG);

    // Creating a group now auto-opens its roster panel to reveal the
    // secret inline — no need to click the toggle to open it here too
    // (doing so would just close what creation already opened).
    newChildInvite = await createGroupInvite(page, "NieuweOuderKind");
    confirmInvite = await createGroupInvite(page, "Robin");
    declineInvite = await createGroupInvite(page, "Sam");
    tim1Invite = await createGroupInvite(page, "Tim");
    tim2Invite = await createGroupInvite(page, "Tim");
    alreadyLoggedInInvite = await createGroupInvite(page, "Robin");
  });

  test("new parent registers, sees an empty candidate list, creates a child, and lands on a named success screen", async ({ page }) => {
    await page.goto(newChildInvite.url);
    await page.waitForSelector("#group-invite-view-step1:not([hidden])");

    await page.click(".group-invite-auth-tab[data-auth-tab='register']");
    await page.fill("#group-invite-register-username", "nieuweouder1");
    await page.fill("#group-invite-register-password", "wachtwoord123");
    await page.click("#group-invite-register-form button[type=submit]");

    await page.waitForSelector("#group-invite-view-step2:not([hidden])");
    await expect(page.locator("#group-invite-picker-list button")).toHaveCount(0);

    await page.click("#group-invite-add-new-child");
    await page.waitForSelector("#group-invite-new-child-form:not([hidden])");
    await pickFirstAvatarAndSetPin(page, "1234");

    await page.waitForSelector("#group-invite-view-success:not([hidden])");
    await expect(page.locator("#group-invite-success-heading")).toHaveText(`NieuweOuderKind is toegevoegd aan ${GROUP_NAME}`);

    // Appears in the group's admin roster (step 3's UI). This page is still
    // logged in as the parent just registered above, so log out first —
    // loginAsAdmin navigates to /parent.html, which lands on the dashboard
    // instead of the login form when already authenticated.
    await page.evaluate(() => fetch("/api/parent/logout", { method: "POST" }));
    await loginAsAdmin(page);
    await page.click(".tab-button[data-tab='groups']");
    const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: GROUP_NAME }) });
    await groupRow.locator(".group-roster-toggle").click();
    await expect(groupRow.locator(".group-roster-list .name", { hasText: "NieuweOuderKind" })).toBeVisible();
  });

  test("a used token shows the same invalid-invite state as a fresh invalid one", async ({ page }) => {
    await page.goto(newChildInvite.url); // already used by the previous test
    await page.waitForSelector("#group-invite-view-invalid:not([hidden])");
  });

  test("existing parent with a fuzzy match logs in without leaving the flow, confirms, and joins the group without losing other memberships", async ({
    page,
  }) => {
    await page.goto(confirmInvite.url);
    await page.waitForSelector("#group-invite-view-step1:not([hidden])");

    await page.fill("#group-invite-login-username", PARENT_USERNAME);
    await page.fill("#group-invite-login-password", PARENT_PASSWORD);
    await page.click("#group-invite-login-form button[type=submit]");

    await page.waitForSelector("#group-invite-view-step2:not([hidden])");
    expect(page.url()).toContain("group-invite.html"); // never redirected to /parent.html mid-flow

    await page.waitForSelector("#group-invite-confirm:not([hidden])");
    await expect(page.locator("#group-invite-confirm-name")).toHaveText("Robin");
    await page.click("#group-invite-confirm-yes");

    await page.waitForSelector("#group-invite-view-success:not([hidden])");
    await expect(page.locator("#group-invite-success-heading")).toHaveText(`Robin is toegevoegd aan ${GROUP_NAME}`);

    // Still in the existing family — this parent's dashboard still lists Robin.
    await page.goto("/parent.html");
    await expect(page.locator(".child-card", { hasText: "Robin" })).toBeVisible();
  });

  test("existing parent declines the match and falls through to the manual picker", async ({ page }) => {
    await page.goto(declineInvite.url);
    await page.waitForSelector("#group-invite-view-step1:not([hidden])");

    await page.fill("#group-invite-login-username", PARENT_USERNAME);
    await page.fill("#group-invite-login-password", PARENT_PASSWORD);
    await page.click("#group-invite-login-form button[type=submit]");

    await page.waitForSelector("#group-invite-confirm:not([hidden])");
    await expect(page.locator("#group-invite-confirm-name")).toHaveText("Sam");
    await page.click("#group-invite-confirm-no");

    await page.waitForSelector("#group-invite-picker:not([hidden])");
    await expect(page.locator("#group-invite-confirm")).toBeHidden();
    await page.locator("#group-invite-picker-list button", { hasText: "Robin" }).click();

    await page.waitForSelector("#group-invite-view-success:not([hidden])");
    await expect(page.locator("#group-invite-success-heading")).toHaveText(`Robin is toegevoegd aan ${GROUP_NAME}`);
  });

  test("two invites for same-named kids in one group: the second is prompted to disambiguate", async ({ page }) => {
    await page.goto(tim1Invite.url);
    await page.click(".group-invite-auth-tab[data-auth-tab='register']");
    await page.fill("#group-invite-register-username", "timouder1");
    await page.fill("#group-invite-register-password", "wachtwoord123");
    await page.click("#group-invite-register-form button[type=submit]");

    await page.waitForSelector("#group-invite-view-step2:not([hidden])");
    await page.click("#group-invite-add-new-child");
    await pickFirstAvatarAndSetPin(page, "1111");
    await page.waitForSelector("#group-invite-view-success:not([hidden])");
    await expect(page.locator("#group-invite-success-heading")).toHaveText(`Tim is toegevoegd aan ${GROUP_NAME}`);

    // A second, unrelated parent also has a child named "Tim" invited into
    // the same group — this must not silently create a second identical
    // tile. Log out first: timouder1's session is still active on this
    // page, and an already-logged-in visit skips Stap 1 entirely, which
    // would make this "second parent" actually act as timouder1.
    await page.evaluate(() => fetch("/api/parent/logout", { method: "POST" }));
    await page.goto(tim2Invite.url);
    await page.click(".group-invite-auth-tab[data-auth-tab='register']");
    await page.fill("#group-invite-register-username", "timouder2");
    await page.fill("#group-invite-register-password", "wachtwoord123");
    await page.click("#group-invite-register-form button[type=submit]");

    await page.waitForSelector("#group-invite-view-step2:not([hidden])");
    await page.click("#group-invite-add-new-child");
    await page.locator("#group-invite-new-child-avatar-picker .avatar-picker-button").first().click();
    await page.fill("#group-invite-new-child-pin", "2222");
    await page.click("#group-invite-new-child-form button[type=submit]");

    await page.waitForSelector("#group-invite-collision:not([hidden])");
    await page.fill("#group-invite-collision-name", "Tim O.");
    await page.click("#group-invite-collision-submit");

    await page.waitForSelector("#group-invite-view-success:not([hidden])");
    await expect(page.locator("#group-invite-success-heading")).toHaveText(`Tim O. is toegevoegd aan ${GROUP_NAME}`);

    // Both appear, distinctly, in the admin roster.
    await page.evaluate(() => fetch("/api/parent/logout", { method: "POST" }));
    await loginAsAdmin(page);
    await page.click(".tab-button[data-tab='groups']");
    const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: GROUP_NAME }) });
    await groupRow.locator(".group-roster-toggle").click();
    await expect(groupRow.locator(".group-roster-list .name", { hasText: "Tim O." })).toBeVisible();
    await expect(groupRow.locator(".group-roster-list .name", { hasText: /^Tim$/ })).toBeVisible();
  });

  test("an already-logged-in parent sees an explicit confirm-or-switch step, not a silent skip to Stap 2", async ({ page }) => {
    await loginAsAdmin(page); // logs in as PARENT_USERNAME and lands on /admin.html

    await page.goto(alreadyLoggedInInvite.url);
    await page.waitForSelector("#group-invite-view-already-logged-in:not([hidden])");
    await expect(page.locator("#group-invite-logged-in-username")).toHaveText(PARENT_USERNAME);
    await expect(page.locator("#group-invite-progress .group-invite-progress-step.active")).toHaveText("Ouder");

    // Declining logs out and returns to the ordinary Stap 1 (login/register).
    await page.click("#group-invite-logout-and-restart");
    await page.waitForSelector("#group-invite-view-step1:not([hidden])");
    const meRes = await page.evaluate(() => fetch("/api/parent/me").then((r) => r.ok));
    expect(meRes).toBe(false);

    // Logging back in from here proceeds straight to Stap 2 as usual —
    // this is an intentional Stap 1 interaction, not a silent skip.
    await page.fill("#group-invite-login-username", PARENT_USERNAME);
    await page.fill("#group-invite-login-password", PARENT_PASSWORD);
    await page.click("#group-invite-login-form button[type=submit]");
    await page.waitForSelector("#group-invite-view-step2:not([hidden])");
    await expect(page.locator("#group-invite-progress .group-invite-progress-step.active")).toHaveText("Kind");

    await page.waitForSelector("#group-invite-confirm:not([hidden])");
    await page.click("#group-invite-confirm-yes");
    await page.waitForSelector("#group-invite-view-success:not([hidden])");
    await expect(page.locator("#group-invite-progress .group-invite-progress-step.active")).toHaveText("Klaar");
  });

  test("an expired token shows the same invalid-invite state as register.html's equivalent", async ({ page }) => {
    const { token, url } = await (async () => {
      await loginAsAdmin(page);
      await page.click(".tab-button[data-tab='groups']");
      const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: GROUP_NAME }) });
      await groupRow.locator(".group-roster-toggle").click();
      return createGroupInvite(page, "Verlopen");
    })();
    expireGroupInvite(token);

    await page.goto(url);
    await page.waitForSelector("#group-invite-view-invalid:not([hidden])");
  });
});
