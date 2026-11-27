import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, destination: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("TechTrack@2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
}

test("stale attendance schedule drafts are cleared when schedules load", async ({ page }) => {
  await login(page, "edrich.bardilas@student.aclc.edu.ph", "/student");
  await page.evaluate(() => {
    localStorage.setItem(
      "techtracker-attendance-draft",
      JSON.stringify({ scheduleId: "stale-schedule-id", shiftDate: "2026-11-27" })
    );
  });
  await page.goto("/attendance");
  await expect(page.getByText("Scheduled shift unavailable")).toHaveCount(0);
  await expect(page.getByText("Select a scheduled shift", { exact: true })).toBeVisible();
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("techtracker-attendance-draft") ?? "{}")
  );
  expect(draft.scheduleId).toBe("");
});

test("task assignment dialog loads its roster and preserves a draft when closed", async ({ page }) => {
  await login(page, "coordinator@aclc-mandaue.edu.ph", "/admin");
  await page.goto("/admin/tasks");
  await page.getByRole("button", { name: "Assign New Task" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign New Task" });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill("Draft test task");
  await dialog.getByLabel("Instructions", { exact: false }).fill("Draft instructions");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Assign New Task" }).click();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Draft test task");
  await expect(dialog.getByLabel("Instructions", { exact: false })).toHaveValue("Draft instructions");
});

test("attendance pagination uses the server total and camera dismissal stops its stream", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const stream = canvas.captureStream(5);
        (window as unknown as { auditTrack: MediaStreamTrack }).auditTrack = stream.getVideoTracks()[0];
        return stream;
      },
    });
  });
  await login(page, "edrich.bardilas@student.aclc.edu.ph", "/student");
  await page.route("**/api/attendance?*", async (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get("page"));
    const items = Array.from({ length: pageNumber === 1 ? 15 : 1 }, (_, i) => ({
      id: `audit-${pageNumber}-${i}`, status: "PENDING", timeIn: "2026-01-01T00:00:00Z",
      timeOut: "2026-01-01T01:00:00Z", recordedHours: 1, isIrregular: false,
      studentId: "audit", photoInKey: "audit.png",
    }));
    await route.fulfill({ json: { items, total: 16, schedules: [] } });
  });
  await page.goto("/attendance");
  const next = page.getByRole("button", { name: "Next page" });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByText("Page 2 / 2")).toBeVisible();
  await page.getByRole("button", { name: "Open Camera" }).click();
  const camera = page.getByRole("dialog", { name: "Camera Capture" });
  await expect(camera).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { auditTrack?: MediaStreamTrack }).auditTrack?.readyState)).toBe("live");
  await page.keyboard.press("Escape");
  await expect(camera).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { auditTrack?: MediaStreamTrack }).auditTrack?.readyState)).toBe("ended");
});

test("registration restores non-secret details without storing passwords", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Draft Student");
  await page.getByLabel("Email address").fill("draft@example.test");
  await page.getByLabel("Password", { exact: true }).fill("private-test-password");
  const stored = await page.evaluate(() => localStorage.getItem("techtracker-registration-draft"));
  expect(stored).toContain("Draft Student");
  expect(stored).not.toContain("private-test-password");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Draft Student");
  await expect(page.getByLabel("Email address")).toHaveValue("draft@example.test");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("task assignment submits a datetime-local deadline as an ISO timestamp", async ({ page }) => {
  await login(page, "coordinator@aclc-mandaue.edu.ph", "/admin");
  await page.goto("/admin/tasks");
  await page.getByRole("button", { name: "Assign New Task" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign New Task" });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(`Deadline regression ${Date.now()}`);
  await dialog.getByLabel("Instructions", { exact: false }).fill("Verify datetime-local conversion");
  await dialog.locator("#deadline").fill("2026-12-31T13:30");
  await dialog.getByRole("checkbox").first().check();
  await dialog.getByRole("button", { name: "Assign Task" }).click();
  await expect(page.getByText("Task assigned successfully")).toBeVisible();
});

test("attendance correction sends the picked local time as an ISO timestamp", async ({ page }) => {
  await login(page, "coordinator@aclc-mandaue.edu.ph", "/admin");
  const item = { id: "audit-correct", status: "PENDING", isIrregular: false, recordedHours: 1,
    student: { id: "audit", fullName: "Audit Student", studentIdNo: "AUDIT" },
    photoInKey: "audit.png", shiftDate: "2026-01-01T00:00:00Z", timeIn: "2026-01-01T05:30:00Z", timeOut: null };
  let submitted: { timeIn?: string; timeOut?: string | null } = {};
  await page.route("**/api/attendance?*", (route) => route.fulfill({ json: { items: [item], total: 1 } }));
  await page.route("**/api/attendance/audit-correct/correct", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/attendance");
  await page.getByRole("row", { name: /Audit Student/ }).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Correct time" }).click();
  const dialog = page.getByRole("dialog", { name: "Correct Attendance Time" });
  await dialog.locator("#correctTimeIn").fill("2026-01-01T13:30");
  await dialog.getByLabel("Correction Reason").fill("Correcting the recorded shift start.");
  await dialog.getByRole("button", { name: "Save Correction" }).click();
  await expect(page.getByText("Attendance time corrected")).toBeVisible();
  expect(submitted.timeIn).toBe(new Date("2026-01-01T13:30").toISOString());
  expect(submitted.timeOut).toBeNull();
});

test("attendance rejection requires a visible remark before submitting", async ({ page }) => {
  await login(page, "coordinator@aclc-mandaue.edu.ph", "/admin");
  const item = { id: "audit-review", status: "PENDING", isIrregular: false, recordedHours: 1,
    student: { id: "audit", fullName: "Audit Student", studentIdNo: "AUDIT" },
    photoInKey: "audit.png", shiftDate: "2026-01-01T00:00:00Z", timeIn: "2026-01-01T00:00:00Z" };
  let submittedRemark: string | null = null;
  await page.route("**/api/attendance?*", (route) => route.fulfill({ json: { items: [item], total: 1 } }));
  await page.route("**/api/attendance/audit-review/review", async (route) => {
    submittedRemark = route.request().postDataJSON().remarks as string;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/attendance");
  await page.getByRole("row", { name: /Audit Student/ }).getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Rejection remarks are mandatory.")).toBeVisible();
  expect(submittedRemark).toBeNull();
  await dialog.getByLabel("Review remarks").fill("Photo does not show the required evidence.");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => submittedRemark).toBe("Photo does not show the required evidence.");
  await expect(dialog).toBeHidden();
});
