import { expect, test } from "@playwright/test";

const STUDENT_EMAIL = "edrich.bardilas@student.aclc.edu.ph";
const PASSWORD = "TechTrack@2026";

/**
 * Regression guard for the card-padding audit: content inside card-like
 * sections must not touch the section border. Sections that render
 * CardHeader/CardContent outside <Card> previously resolved --card-spacing
 * to an undefined value, so every horizontal/vertical pad collapsed to 0.
 */
const CARD_PAGES = [
  { path: "/attendance", heading: "Record duty" },
  { path: "/tasks", heading: "My Tasks" },
];

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(STUDENT_EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator("main")).toBeVisible();
}

for (const { path, heading } of CARD_PAGES) {
  test(`${path} card content has breathing room from the section border`, async ({ page }) => {
    await login(page);
    await page.goto(path);

    const title = page.getByText(heading, { exact: true }).first();
    await expect(title).toBeVisible();

    const section = page.locator(`section:has-text("${heading}")`).first();
    const box = await section.boundingBox();
    expect(box).not.toBeNull();

    const titleBox = await title.boundingBox();
    expect(titleBox).not.toBeNull();

    // The heading must sit at least 12px inside the card, never flush with it.
    expect(titleBox!.x - box!.x).toBeGreaterThanOrEqual(12);
    expect(titleBox!.y - box!.y).toBeGreaterThanOrEqual(12);

    // No horizontal overflow at the card edge.
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
