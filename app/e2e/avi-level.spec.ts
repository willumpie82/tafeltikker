import { test, expect } from "@playwright/test";
import { loginAsParent } from "./helpers.js";

test("parent can see and save a child's AVI reading level", async ({ page }) => {
  await loginAsParent(page);
  const samCard = page.locator(".child-card", { hasText: "Sam" });
  await samCard.locator(".child-edit-toggle").click();

  const select = samCard.locator("select[name=aviLevel]");
  await expect(select).toHaveValue("avi_m4_e4"); // the seeded default

  await samCard.locator(".edit-form button[type=submit]").click();

  // A successful save reloads the dashboard, which re-renders every card
  // collapsed — the (re-queried) card no longer having an open edit form is
  // the signal the PATCH round-tripped without error.
  await expect(samCard.locator(".edit-form")).toHaveCount(0);

});
