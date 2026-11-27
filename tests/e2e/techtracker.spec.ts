import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PASSWORD = "TechTrack@2026";
const STUDENT_EMAIL = "edrich.bardilas@student.aclc.edu.ph";
const ADMIN_EMAIL = "coordinator@aclc-mandaue.edu.ph";
const SUPERADMIN_EMAIL = "superadmin@aclc-mandaue.edu.ph";
const SCREENSHOT_DIR = "/home/hrmr/.hermes/cache/scratch/qa_shots";
const DIAGNOSTICS_FILE = "/home/hrmr/.hermes/cache/scratch/qa_browser_diagnostics.jsonl";

interface Diagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  serverErrors: string[];
  failedRequests: string[];
}

const diagnosticsByPage = new WeakMap<Page, Diagnostics>();

function attachDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    serverErrors: [],
    failedRequests: [],
  };
  diagnosticsByPage.set(page, diagnostics);

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.stack ?? error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });

  return diagnostics;
}

function recordDiagnostics(testInfo: TestInfo, diagnostics: Diagnostics): void {
  fs.mkdirSync(path.dirname(DIAGNOSTICS_FILE), { recursive: true });
  fs.appendFileSync(
    DIAGNOSTICS_FILE,
    `${JSON.stringify({
      project: testInfo.project.name,
      test: testInfo.title,
      consoleErrors: diagnostics.consoleErrors,
      pageErrors: diagnostics.pageErrors,
      serverErrors: diagnostics.serverErrors,
      failedRequests: diagnostics.failedRequests,
    })}\n`,
    "utf8",
  );
}

test.beforeEach(async ({ page }) => {
  attachDiagnostics(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = diagnosticsByPage.get(page);
  if (!diagnostics) return;
  recordDiagnostics(testInfo, diagnostics);

  const unexpected = [...diagnostics.pageErrors, ...diagnostics.serverErrors];
  expect(unexpected, `Unexpected browser/runtime defects in ${testInfo.title}`).toEqual([]);
});

async function visit(page: Page, route: string): Promise<void> {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 0, `Initial response for ${route}`).toBeLessThan(500);
  await expect(page.locator("body")).toBeVisible();
}

async function loginAs(page: Page, email: string, destination: string): Promise<void> {
  await visit(page, "/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replaceAll("/", "\\/")}$`));
  await expect(page.locator("main")).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page, route: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 100),
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
        };
      })
      .filter((element) => element.right > window.innerWidth + 1 || element.left < -1)
      .sort((a, b) => Math.max(b.right - window.innerWidth, -b.left) - Math.max(a.right - window.innerWidth, -a.left))
      .slice(0, 8),
  }));
  expect(
    metrics.rootScrollWidth,
    `${route} root scrollWidth ${metrics.rootScrollWidth} exceeds viewport ${metrics.viewportWidth}; offenders: ${JSON.stringify(metrics.offenders)}`,
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(
    metrics.bodyScrollWidth,
    `${route} body scrollWidth ${metrics.bodyScrollWidth} exceeds viewport ${metrics.viewportWidth}`,
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function assertAuthenticatedRoute(page: Page, route: string): Promise<void> {
  await visit(page, route);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Loading (?:coordinator|SuperAdmin|lab|reports|tasks|attendance|messages|notifications)/i);
}

async function selectFirstScheduledShift(page: Page): Promise<void> {
  const scheduleTrigger = page.locator('[data-slot="select-trigger"]').first();
  await expect(scheduleTrigger).toBeVisible();
  await scheduleTrigger.click();
  const firstOption = page.locator('[data-slot="select-content"] [data-slot="select-item"]').first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
}

test("public landing and auth entry have the required controls", async ({ page }) => {
  await visit(page, "/");
  await expect(page.getByRole("heading", { name: /Track duty hours/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Create student account" }).first()).toBeVisible();
  await assertNoHorizontalOverflow(page, "/");

  await visit(page, "/login");
  await expect(page.getByRole("heading", { name: "Sign in to TechTracker" })).toBeVisible();
  await expect(page.locator("select, input[type=radio], [role=radio]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/renter|landlord/i);
  await assertNoHorizontalOverflow(page, "/login");

  const loginPassword = page.locator("#password");
  const showLoginPassword = page.getByRole("button", { name: "Show password" });
  await expect(showLoginPassword).toHaveCount(1);
  await expect(loginPassword).toHaveAttribute("type", "password");
  await showLoginPassword.click();
  await expect(loginPassword).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveCount(1);
  await expect(page.getByText("Show", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Hide", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(loginPassword).toHaveAttribute("type", "password");

  await visit(page, "/register");
  await expect(page.getByRole("heading", { name: "Create student account" })).toBeVisible();
  await expect(page.locator("select, input[type=radio], [role=radio]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/renter|landlord/i);
  await assertNoHorizontalOverflow(page, "/register");
});

test("invalid login reports an error without touching seeded accounts", async ({ page }) => {
  await visit(page, "/login");
  await page.getByLabel("Email address").fill(`qa.invalid.${Date.now()}@example.invalid`);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /invalid|failed|password|sign-in/i })).toContainText(/invalid|failed|password|sign-in/i);
});

test("registration creates a student and verification link in the email outbox", async ({ page }) => {
  const stamp = Date.now();
  const email = `qa.${stamp}@student.aclc.edu.ph`;
  const studentId = `QA${stamp}`;
  const password = "QaE2Epass@2026";

  await visit(page, "/register");
  await page.getByLabel("Full name").fill(`QA E2E Student ${stamp}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Student ID number").fill(studentId);
  await page.getByLabel("Program").fill("BSIT");
  await page.getByLabel("Section").fill("QA-E2E");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create student account", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Registration received");

  const prisma = new PrismaClient();
  let bodyText = "";
  try {
    const queued = await prisma.emailOutbox.findFirst({
      where: { toEmail: email, category: "VERIFICATION" },
      orderBy: { createdAt: "desc" },
    });
    bodyText = queued?.body ?? "";
  } finally {
    await prisma.$disconnect();
  }
  const verificationUrl = bodyText.match(/https?:\/\/[^\s]+\/api\/auth\/verify\?token=[^\s]+/)?.[0];
  expect(verificationUrl, "Verification URL must be stored in the email outbox").toBeTruthy();

  await page.goto(verificationUrl!);
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await expect(page.getByRole("status")).toContainText("Email verified successfully");

  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole("heading", { name: "Your Pre-OJT progress", exact: true })).toBeVisible();
});

test("theme control toggles light/dark and persists System selection", async ({ page }) => {
  await loginAs(page, STUDENT_EMAIL, "/student");
  const themeToggle = page.getByRole("button", { name: "Toggle light or dark theme" });
  const systemTheme = page.getByRole("button", { name: "Use system theme" });
  await expect(themeToggle).toBeVisible();
  await expect(systemTheme).toBeVisible();

  await themeToggle.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("techtracker_theme"))).toMatch(/^(light|dark)$/);
  const toggledTheme = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(toggledTheme);

  await page.getByRole("button", { name: "Use system theme" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("techtracker_theme"))).toBe("system");
  await expect(page.getByRole("button", { name: "Use system theme" })).toHaveAttribute("aria-pressed", "true");
});

test("student dashboard, attendance, tasks, inspections, messages, notifications and profile flow", async ({ page }) => {
  await loginAs(page, STUDENT_EMAIL, "/student");
  await expect(page.getByText(/Credited \(Approved\)/)).toBeVisible();
  await expect(page.getByText(/Pending Review/).first()).toBeVisible();
  await expect(page.getByText("100-Hour Pre-OJT Ledger", { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page, "/student");
  await expect(Boolean(await page.evaluate(() => Boolean((window as Window & { __geoRequested?: boolean }).__geoRequested)))).toBe(false);

  await visit(page, "/attendance");
  await expect(page.getByText("Record duty", { exact: true })).toBeVisible();
  await selectFirstScheduledShift(page);
  await page.getByLabel("Shift date").fill(new Date().toISOString().slice(0, 10));
  await page.locator("#photo-upload").setInputFiles({
    name: "qa-time-in.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const attendanceResponse = page.waitForResponse(
    (response) => response.url().includes("/api/attendance") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirm Time-In", exact: true }).click();
  const attendanceResult = await attendanceResponse;
  expect(attendanceResult.status()).toBe(201);
  const attendanceBody = (await attendanceResult.json()) as { attendance: { timeIn: string } };
  await expect(page.getByText(/Confirmed receipt:/)).toBeVisible();
  const recordedDate = new Date(attendanceBody.attendance.timeIn).toLocaleDateString();
  await expect(page.locator("section").filter({ hasText: "My attendance" })).toContainText(recordedDate);

  // Close the open attendance session with Time-Out so subsequent runs start clean.
  await page.locator("#photo-upload").setInputFiles({
    name: "qa-time-out.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const timeOutResponse = page.waitForResponse(
    (response) => response.url().includes("/api/attendance") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Time-Out", exact: true }).first().click();
  expect((await timeOutResponse).status()).toBe(200);
  await expect(page.getByText(/Confirmed receipt:/).first()).toBeVisible();

  await expect(page.getByRole("button", { name: /Accreditation PDF Locked/i })).toBeDisabled();

  await visit(page, "/tasks");
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Invalid Date");
  const taskLink = page.locator('a[href^="/tasks/"]').first();
  await expect(taskLink).toHaveCount(1);
  await taskLink.click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await expect(page.getByText("Completion Report", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Invalid Date");

  await visit(page, "/inspections");
  await expect(page.getByText("Laboratory rooms", { exact: false })).toBeVisible();
  const roomLink = page.getByRole("link", { name: "Open unit checklist" }).first();
  await expect(roomLink).toBeVisible();
  await roomLink.click();
  await expect(page).toHaveURL(/\/inspections\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /Checklist —/ })).toBeVisible();
  const conditionSelects = page.getByRole("combobox", { name: /Condition for unit/ });
  await conditionSelects.nth(0).selectOption("NEEDS_REPAIR");
  await conditionSelects.nth(3).selectOption("NEEDS_MAINTENANCE");
  await page.getByRole("button", { name: "Submit room inspection", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Cannot submit yet" })).toContainText(/Defect remarks are required/i);
  const defectRemarks = page.getByLabel(/Defect remarks/);
  await defectRemarks.nth(0).fill("QA inspection defect remark");
  await defectRemarks.nth(3).fill("QA maintenance remark");
  await defectRemarks.nth(6).fill("QA seeded repair remark");
  await page.getByRole("button", { name: "Submit room inspection", exact: true }).click();
  await expect(page.getByText("Inspection submitted", { exact: true })).toBeVisible();
  await expect(page.getByText(/No repair tickets or urgent dispatches/i)).toBeVisible();

  await visit(page, "/messages");
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await visit(page, "/notifications");
  await expect(page.getByRole("heading", { name: "Notifications & System Alerts" })).toBeVisible();
  await visit(page, "/profile");
  await expect(page.getByText("Change Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account settings", exact: true })).toBeVisible();
  const profilePassword = page.getByLabel("Current password");
  const profileToggle = page.getByRole("button", { name: "Show password" }).first();
  await expect(profileToggle).toBeVisible();
  await profileToggle.click();
  await expect(profilePassword).toHaveAttribute("type", "text");
  await expect(page.getByText("Show", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Hide", { exact: true })).toHaveCount(0);

  for (const route of ["/attendance", "/tasks", "/inspections", "/profile"]) {
    await visit(page, route);
    await assertNoHorizontalOverflow(page, route);
  }
});

test("completed student can download 100-hour accreditation PDF", async ({ page }) => {
  await loginAs(page, "joan.inting@student.aclc.edu.ph", "/student");
  await visit(page, "/attendance");
  const pdfLink = page.getByRole("link", { name: /Download Accreditation Log \(PDF\)/ });
  await expect(pdfLink).toBeVisible();
  const href = await pdfLink.getAttribute("href");
  expect(href).toBeTruthy();
  const pdfRes = await page.request.get(new URL(href!, page.url()).toString());
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
});

test("student dashboard screenshot", async ({ page }, testInfo) => {
  await loginAs(page, STUDENT_EMAIL, "/student");
  await expect(page.getByText("100-Hour Pre-OJT Ledger", { exact: true })).toBeVisible();
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${testInfo.project.name}-student.png`),
    fullPage: true,
  });
});

test("coordinator can open all required administrative routes", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, "/admin");
  for (const route of ["/admin", "/admin/attendance", "/admin/tasks", "/admin/students", "/admin/batches", "/admin/reports"]) {
    await assertAuthenticatedRoute(page, route);
    await assertNoHorizontalOverflow(page, route);
  }
});

test("coordinator administrative controls expose pagination, filters and exports", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, "/admin");
  await visit(page, "/admin/attendance");
  const rowsPerPage = page.getByLabel("Rows per page");
  await expect(rowsPerPage).toBeVisible();
  await expect(rowsPerPage.locator("option")).toHaveText(["15", "25", "50"]);
  await rowsPerPage.selectOption("25");

  await page.getByPlaceholder("Search by student name or ID").fill("Edrich");
  const statusTrigger = page.locator('[data-slot="select-trigger"]').first();
  await statusTrigger.click();
  await page.getByRole("option", { name: "Pending", exact: true }).click();

  await visit(page, "/admin/reports");
  await expect(page.getByText("Report filters", { exact: true })).toBeVisible();
  await expect(page.locator("#report-type")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toHaveAttribute("href", /format=csv/);
  await expect(page.getByRole("link", { name: "Export PDF", exact: true })).toHaveAttribute("href", /format=pdf/);
  const csvHref = await page.getByRole("link", { name: "Export CSV", exact: true }).getAttribute("href");
  expect(csvHref).toBeTruthy();
  const csvResponse = await page.request.get(new URL(csvHref!, page.url()).toString());
  expect(csvResponse.status()).toBe(200);
  const pdfHref = await page.getByRole("link", { name: "Export PDF", exact: true }).getAttribute("href");
  expect(pdfHref).toBeTruthy();
  const pdfResponse = await page.request.get(new URL(pdfHref!, page.url()).toString());
  expect(pdfResponse.status()).toBe(200);

  await page.locator("#report-type").click();
  await page.getByRole("option", { name: "Task progress", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export CSV", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Generate report", exact: true }).click();
  await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toHaveAttribute("href", /type=task-progress/);

  await visit(page, "/admin/tasks");
  await expect(page.locator("main")).not.toContainText("Invalid Date");
  const adminTaskLink = page.locator('a[href^="/admin/tasks/"]').first();
  await expect(adminTaskLink).toBeVisible();
  await adminTaskLink.click();
  await expect(page).toHaveURL(/\/admin\/tasks\/[^/]+$/);
  await expect(page.getByText("Latest Submission", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Invalid Date");
});

test("coordinator screenshot", async ({ page }, testInfo) => {
  await loginAs(page, ADMIN_EMAIL, "/admin");
  await expect(page.getByRole("heading", { name: "Pre-OJT Coordinator Dashboard" })).toBeVisible();
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${testInfo.project.name}-admin.png`),
    fullPage: true,
  });
});

test("SuperAdmin tabs render and chat remains forbidden", async ({ page }) => {
  await loginAs(page, SUPERADMIN_EMAIL, "/superadmin");
  await expect(page.getByRole("heading", { name: "SuperAdmin Console" })).toBeVisible();
  for (const tabName of ["Admins", "100-Hr Config", "Batches", "Rulings", "Audit Log", "Lab Rooms", "Alerts"]) {
    const tab = page.getByRole("tab", { name: new RegExp(tabName, "i") });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.locator('[aria-label="Subsystem workspace"]')).toBeVisible();
  }

  await visit(page, "/messages");
  await expect(page.getByText("Alerts Only — No Chat Access", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Message")).toHaveCount(0);
  const forbiddenResponse = await page.request.post(new URL("/api/messages", page.url()).toString(), {
    data: { body: "QA boundary probe" },
  });
  expect(forbiddenResponse.status()).toBe(403);
  await assertNoHorizontalOverflow(page, "/messages");
});

test("role-specific responsive pages do not overflow horizontally", async ({ page }) => {
  await visit(page, "/");
  await assertNoHorizontalOverflow(page, "/");
  await visit(page, "/login");
  await assertNoHorizontalOverflow(page, "/login");
  await visit(page, "/register");
  await assertNoHorizontalOverflow(page, "/register");

  await loginAs(page, STUDENT_EMAIL, "/student");
  for (const route of ["/student", "/attendance", "/tasks", "/inspections", "/profile"]) {
    await visit(page, route);
    await assertNoHorizontalOverflow(page, route);
  }

  await loginAs(page, ADMIN_EMAIL, "/admin");
  for (const route of ["/admin", "/admin/attendance", "/admin/tasks", "/admin/students", "/admin/batches", "/admin/reports"]) {
    await visit(page, route);
    await assertNoHorizontalOverflow(page, route);
  }

  await loginAs(page, SUPERADMIN_EMAIL, "/superadmin");
  for (const route of ["/superadmin", "/messages", "/profile"]) {
    await visit(page, route);
    await assertNoHorizontalOverflow(page, route);
  }
});
