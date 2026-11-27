import { expect, test } from "@playwright/test";

const batchId = "89e0b2eb-4369-4711-bebf-105331da0cfe";
const batchName = "2026 Second Semester Pre-OJT Mandaue Campus Information Technology Cohort";

test("report filters show labels and stay aligned without overflow", async ({ page }) => {
  await page.addInitScript(({ storageKey, batchId: storedBatchId }) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ type: "duty-hours", batchId: storedBatchId, section: "", dateFrom: "", dateTo: "" }),
    );
  }, { storageKey: "techtracker-report-filters", batchId });

  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "admin-1", fullName: "Test Coordinator", email: "admin@example.test", role: "ADMIN" } }),
  }));
  await page.route("**/api/notifications**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ unread: 0 }),
  }));
  await page.route("**/api/admin/reports**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: [], page: 1, pageSize: 15, total: 0 }),
  }));
  await page.route("**/api/admin/batches**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: batchId, name: batchName, section: "A" }] }),
    });
  });

  await page.goto("/admin/reports");
  const reportType = page.locator("#report-type");
  const reportTypeValue = reportType.locator('[data-slot="select-value"]');
  const batch = page.locator("#report-batch");
  const batchValue = batch.locator('[data-slot="select-value"]');
  const section = page.locator("#report-section");
  const controls = [reportType, batch, section, page.locator("#report-from"), page.locator("#report-to")];

  await expect(reportTypeValue).toHaveText("Duty hours");
  await expect(batchValue).toContainText("Loading batches…");
  await expect(batch).not.toContainText(batchId);
  await expect(batchValue).toHaveText(batchName);

  const initialBatchBounds = await batch.boundingBox();
  const sectionBounds = await section.boundingBox();
  expect(initialBatchBounds).not.toBeNull();
  expect(sectionBounds).not.toBeNull();
  const overlaps = (a: NonNullable<typeof initialBatchBounds>, b: NonNullable<typeof sectionBounds>) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  expect(overlaps(initialBatchBounds!, sectionBounds!)).toBe(false);

  const measurements = await Promise.all(controls.map((control) => control.boundingBox()));
  expect(measurements.every(Boolean)).toBe(true);
  expect(measurements.map((box) => Math.round(box!.height))).toEqual([40, 40, 40, 40, 40]);
  if (page.viewportSize()!.width >= 1280) {
    expect(new Set(measurements.map((box) => Math.round(box!.y))).size).toBe(1);
  } else {
    expect(measurements.map((box) => box!.y)).toEqual([...measurements.map((box) => box!.y)].sort((a, b) => a - b));
  }

  const truncation = await batch.evaluate((trigger) => {
    const value = trigger.querySelector<HTMLElement>('[data-slot="select-value"]');
    if (!value) return null;
    return {
      triggerOverflow: getComputedStyle(trigger).overflow,
      valueMinWidth: getComputedStyle(value).minWidth,
      valueOverflow: getComputedStyle(value).overflow,
      valueTextOverflow: getComputedStyle(value).textOverflow,
    };
  });
  expect(truncation).toEqual({
    triggerOverflow: "hidden",
    valueMinWidth: "0px",
    valueOverflow: "hidden",
    valueTextOverflow: "ellipsis",
  });

  await batch.click();
  await page.getByRole("option", { name: "All batches", exact: true }).click();
  await expect(batchValue).toHaveText("All batches");
  await batch.click();
  await page.getByRole("option", { name: batchName, exact: true }).click();
  await expect(batchValue).toHaveText(batchName);
  await expect(batch).not.toContainText(batchId);
});
