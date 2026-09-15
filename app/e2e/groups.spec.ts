import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers.js";
import { addChildToGroup, getChildId, getGroupId } from "./db.js";

test("admin can create a group and see the klas-geheim exactly once", async ({ page }) => {
  await loginAsAdmin(page);
  await page.click(".tab-button[data-tab='groups']");
  await page.click("#add-group-button");
  await page.fill("#new-group-name", "Klas 4A");
  await page.fill("#new-group-slug", "klas4a");
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/admin/groups") && res.request().method() === "POST"),
    page.click("#add-group-form button[type=submit]"),
  ]);
  const { secret } = await response.json();
  expect(secret.length).toBeGreaterThan(0);

  // The secret reveal lands inline on this group's own (now auto-opened)
  // roster panel, clearly tied to which group it belongs to — not a
  // generic panel disconnected from context.
  const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: "Klas 4A" }) });
  await expect(groupRow.locator(".group-secret-reveal")).toBeVisible();
  await expect(groupRow.locator(".group-secret-reveal-value")).toHaveValue(secret);
  await expect(groupRow.locator(".group-secret-reveal")).toContainText("Klas 4A");
});

test("a duplicate group slug is rejected", async ({ page }) => {
  await loginAsAdmin(page);
  await page.click(".tab-button[data-tab='groups']");
  await page.click("#add-group-button");
  await page.fill("#new-group-name", "Klas 4A opnieuw");
  await page.fill("#new-group-slug", "klas4a"); // created by the previous test
  await page.click("#add-group-form button[type=submit]");

  await page.waitForSelector("#add-group-error:not([hidden])");
  await expect(page.locator("#add-group-error")).toHaveText("Deze slug is al in gebruik.");
});

test("removing a child from a group's roster doesn't touch the child's account or other memberships", async ({ page }) => {
  const groupId = getGroupId("klas4a");
  const childId = getChildId("Sam");
  addChildToGroup(groupId, childId);

  await loginAsAdmin(page);
  await page.click(".tab-button[data-tab='groups']");

  const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: "Klas 4A" }) });
  await groupRow.locator(".group-roster-toggle").click();
  await expect(groupRow.locator(".group-roster-list .name", { hasText: "Sam" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await groupRow.getByRole("button", { name: "Verwijderen uit groep" }).click();
  // Removal reloads the whole tab (collapsing the roster panel back to
  // closed) — reopen it to confirm Sam is genuinely gone, not just hidden.
  await expect(groupRow.locator(".admin-row-meta", { hasText: "0 kind(eren)" })).toBeVisible();
  await groupRow.locator(".group-roster-toggle").click();
  await expect(groupRow.getByText("Nog geen kinderen in deze groep.")).toBeVisible();
  await expect(groupRow.locator(".group-roster-list .name", { hasText: "Sam" })).toHaveCount(0);

  // Sam's own account (and standing as a child on the parent dashboard)
  // is untouched by a roster removal.
  await page.goto("/parent.html");
  await expect(page.locator(".child-card", { hasText: "Sam" })).toBeVisible();
});

test("admin creates a group invite and sees the link with the child's name attached", async ({ page }) => {
  await loginAsAdmin(page);
  await page.click(".tab-button[data-tab='groups']");

  const groupRow = page.locator(".admin-row", { has: page.locator(".name", { hasText: "Klas 4A" }) });
  await groupRow.locator(".group-roster-toggle").click();

  await groupRow.locator(".group-invite-child-name").fill("Tim");
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/invites") && res.request().method() === "POST"),
    groupRow.locator(".group-invite-form button[type=submit]").click(),
  ]);
  const { url } = await response.json();
  expect(url).toContain("/group-invite.html?token=");

  // Shown once, in the list — highlighted as newly created — rather than
  // duplicated in a separate reveal box above it.
  const newInviteRow = groupRow.locator(".group-invites-list .admin-row.newly-created", { hasText: "Tim" });
  await expect(newInviteRow).toBeVisible();
  await expect(newInviteRow.locator(".status-badge")).toHaveText("In afwachting");
});
