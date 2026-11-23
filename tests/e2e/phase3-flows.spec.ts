import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 regression coverage for the flows the student UI audit found
 * untested: composer clearing, conversation history, task start/submit/resubmit,
 * the task status filter, Time-Out, notification mark-read, and Reset session.
 */

const PASSWORD = "TechTrack@2026";
const STUDENT_EMAIL = "edrich.bardilas@student.aclc.edu.ph";
const RUST_BACKEND_URL = process.env.RUST_BACKEND_URL?.replace(/\/$/, "");

async function login(page: Page, email: string, destination: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replaceAll("/", "\\/")}$`));
}

function conversation(id: string, label: string) {
  return {
    id,
    title: label,
    type: "DIRECT",
    updatedAt: "2026-01-01T00:00:00.000Z",
    batch: null,
    members: [{ user: { id: "peer", fullName: label, email: "peer@example.test", role: "ADMIN" } }],
    messages: [
      {
        id: `${id}-m1`,
        conversationId: id,
        senderId: "peer",
        body: `hello from ${label}`,
        attachmentKey: null,
        attachmentName: null,
        attachmentSize: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

test("sending a message clears the composer", async ({ page }) => {
  await page.route("**/api/messages?*", (route) =>
    route.fulfill({ json: { conversations: [conversation("conv-1", "Coordinator")], page: 1, pageSize: 5 } }),
  );
  let posted: { body?: string } | null = null;
  await page.route("**/api/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posted = route.request().postDataJSON();
    await route.fulfill({ json: { message: { id: "sent-1" } } });
  });

  await login(page, STUDENT_EMAIL, "/student");
  await page.goto("/messages");
  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();
  await composer.fill("Please review my task submission.");
  await expect(page.getByText("Draft preserved locally on this device.")).toBeVisible();

  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted!).toMatchObject({ conversationId: "conv-1", body: "Please review my task submission." });

  await expect(composer).toHaveValue("");
  await expect(page.getByText("Draft preserved locally on this device.")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("techtracker-message-draft-conv-1")))
    .toBeNull();
});

test("older conversations load on demand", async ({ page }) => {
  const firstPage = Array.from({ length: 5 }, (_, i) => conversation(`conv-${i}`, `Thread ${i}`));
  const secondPage = Array.from({ length: 5 }, (_, i) => conversation(`old-${i}`, `Older thread ${i}`));
  await page.route("**/api/messages?*", (route) => {
    const url = new URL(route.request().url());
    const wanted = url.searchParams.get("page") === "2" ? secondPage : firstPage;
    return route.fulfill({ json: { conversations: wanted, page: Number(url.searchParams.get("page") ?? 1), pageSize: 5 } });
  });

  await login(page, STUDENT_EMAIL, "/student");
  await page.goto("/messages");
  const conversationList = page.getByRole("region", { name: "Conversations" });
  await expect(conversationList.getByText("Thread 0", { exact: true })).toBeVisible();

  const loadOlder = page.getByRole("button", { name: "Load older conversations" });
  await expect(loadOlder).toBeVisible();
  await loadOlder.click();

  await expect(conversationList.getByText("Older thread 0", { exact: true })).toBeVisible();
  await expect(conversationList.getByText("Thread 0", { exact: true })).toBeHidden();
});

test("task status filter returns only matching assignments", async ({ page }) => {
  await login(page, STUDENT_EMAIL, "/student");

  const badgeLabels: Record<string, string> = {
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In Progress",
    SUBMITTED: "Submitted",
    RETURNED: "Returned",
    ACCEPTED: "Accepted",
  };

  const captured: Array<{ status: string | null; items: Array<{ assignments?: Array<{ status: string }> }> }> = [];
  await page.route("**/api/tasks?*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { items?: Array<{ assignments?: Array<{ status: string }> }> };
    captured.push({ status: new URL(route.request().url()).searchParams.get("status"), items: body.items ?? [] });
    await route.fulfill({ response });
  });

  await page.goto("/tasks");
  const table = page.locator("table");
  await expect(table.locator("tbody tr").first()).toBeVisible();
  const statusCell = table.locator("tbody tr td:nth-child(4)");

  for (const [status, label] of Object.entries(badgeLabels)) {
    await page.getByLabel("Filter by status").click();
    await page.getByRole("option", { name: status.replace("_", " ") }).click();

    // The filtered request must reach the server and only return matching assignments.
    await expect.poll(() => captured.filter((entry) => entry.status === status).length).toBeGreaterThan(0);
    const filtered = captured.filter((entry) => entry.status === status).at(-1)!;
    expect(
      filtered.items.every((item) => (item.assignments ?? []).every((assignment) => assignment.status === status)),
      `status=${status} returned non-matching assignments`,
    ).toBe(true);

    // And the table must only render the selected status.
    await expect
      .poll(async () => {
        const texts = (await statusCell.allInnerTexts()).map((text) => text.trim());
        return { count: texts.length, allMatch: texts.every((text) => text === label) };
      })
      .toEqual({ count: filtered.items.length, allMatch: true });
  }
});

test("a task can be started, submitted, and resubmitted after review", async ({ page }) => {
  let status = "RETURNED";
  const remarks = [{ body: "Please attach the signed checklist.", visibility: "STUDENT_VISIBLE", author: { fullName: "Coordinator" }, createdAt: "2026-01-01T00:00:00.000Z" }];
  const taskPayload = () => ({
    task: {
      id: "seed-task",
      title: "Calibrate bench multimeter",
      instructions: "Calibrate and document the readings.",
      category: "Instrumentation",
      deadline: "2026-12-01T00:00:00.000Z",
      assignments: [
        {
          id: "seed-assignment",
          status,
          startedAt: status === "ASSIGNED" ? null : "2026-01-01T00:00:00.000Z",
          student: { fullName: "Edrich Bardilas" },
          submissions: [],
          remarks,
        },
      ],
    },
  });

  await page.route("**/api/tasks/seed-task/start", async (route) => {
    status = "IN_PROGRESS";
    await route.fulfill({ json: { assignment: { status } } });
  });
  let submittedSummary: string | null = null;
  await page.route("**/api/tasks/seed-task/submit", async (route) => {
    const body = route.request().postData() ?? "";
    submittedSummary = body.includes("summary") ? "captured" : null;
    status = "SUBMITTED";
    await route.fulfill({ json: { submission: { id: "sub-1", version: 1 } } });
  });
  await page.route("**/api/tasks/seed-task", (route) => route.fulfill({ json: taskPayload() }));

  await login(page, STUDENT_EMAIL, "/student");
  await page.goto("/tasks/seed-task");

  await expect(page.getByText("Returned for revision", { exact: true })).toBeVisible();
  await expect(page.getByText("Please attach the signed checklist.", { exact: true }).first()).toBeVisible();

  const summary = page.getByLabel("Completion Summary");
  await expect(summary).toBeVisible();

  await page.getByRole("button", { name: "Start task" }).click();
  await expect.poll(() => status).toBe("IN_PROGRESS");
  await expect(page.getByText("Returned for revision", { exact: true })).toBeHidden();

  await summary.fill("First pass at the calibration procedure.");
  await page.getByRole("button", { name: "Submit / Resubmit" }).click();
  await expect.poll(() => submittedSummary).not.toBeNull();
  await expect(page.getByText("Completion report submitted successfully.", { exact: true })).toBeVisible();
  await expect(summary).toHaveValue("");

  // The coordinator returns the report; the student can resubmit without a dead end.
  status = "RETURNED";
  await page.reload();
  await expect(page.getByText("Returned for revision", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit / Resubmit" })).toBeEnabled();
  await summary.fill("Second pass with the signed checklist attached.");
  await page.getByRole("button", { name: "Submit / Resubmit" }).click();
  await expect.poll(() => status).toBe("SUBMITTED");
});

test("Time-Out records the punch against the right attendance row", async ({ page }) => {
  const items = [
    {
      id: "open-row",
      status: "PENDING",
      timeIn: "2026-01-01T08:00:00.000Z",
      timeOut: null,
      recordedHours: 4,
      isIrregular: false,
      studentId: "student",
      photoInKey: "open.png",
      schedule: { label: "Morning Technical Duty" },
    },
    {
      id: "closed-row",
      status: "APPROVED",
      timeIn: "2026-01-01T08:00:00.000Z",
      timeOut: "2026-01-01T12:00:00.000Z",
      recordedHours: 4,
      isIrregular: false,
      studentId: "student",
      photoInKey: "closed.png",
      schedule: { label: "Afternoon Technical Duty" },
    },
  ];
  await page.route("**/api/attendance?*", (route) => route.fulfill({ json: { items, total: 2, schedules: [] } }));
  let submitted: string | null = null;
  await page.route("**/api/attendance", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postData() ?? "";
    await route.fulfill({ json: { receipt: { id: "receipt-1" } } });
  });

  await login(page, STUDENT_EMAIL, "/student");
  await page.goto("/attendance");
  await expect(page.getByRole("button", { name: "Time-Out" })).toHaveCount(1);

  await page.locator("#photo-upload").setInputFiles({
    name: "punch.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await page.getByRole("button", { name: "Time-Out" }).click();

  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted!).toContain("TIME_OUT");
  expect(submitted!).toContain("open-row");
  expect(submitted!).not.toContain("closed-row");
});

test("notifications can be marked read individually and in bulk", async ({ page }) => {
  const notifications = [
    { id: "n-1", isRead: false, type: "ASSIGNMENT", title: "New task assigned", body: "Calibrate the multimeter", link: null, createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "n-2", isRead: false, type: "ESCALATION", title: "Schedule escalated", body: "Your coordinator was notified", link: null, createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  await page.route("**/api/notifications?*", (route) =>
    route.fulfill({ json: { data: notifications, page: 1, pageSize: 15, total: 2, unread: 2, totalPages: 1 } }),
  );
  const patches: Array<{ ids?: string[]; all?: boolean }> = [];
  await page.route("**/api/notifications", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches.push(route.request().postDataJSON());
    await route.fulfill({ json: { markedRead: 2 } });
  });

  await login(page, STUDENT_EMAIL, "/student");
  await page.goto("/notifications");
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeEnabled();

  await page.getByRole("button", { name: "Mark as read" }).first().click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].ids).toEqual(["n-1"]);

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toMatchObject({ all: true });
});

test("Reset session asks for confirmation before discarding unit data", async ({ page }) => {
  const room = {
    id: "room-1",
    name: "Laboratory 1",
    units: [
      { id: "unit-1", unitCode: "BENCH-01", condition: "FUNCTIONING" },
      { id: "unit-2", unitCode: "BENCH-02", condition: "FUNCTIONING" },
    ],
  };
  await page.route("**/api/inspections/rooms", (route) => route.fulfill({ json: { rooms: [room] } }));

  await login(page, STUDENT_EMAIL, "/student");
  await page.goto("/inspections/room-1");
  const unitCard = page.locator("article").filter({ hasText: "BENCH-01" });
  const condition = unitCard.getByLabel("Condition for unit BENCH-01");
  const remarks = unitCard.getByRole("textbox");
  await expect(condition).toBeVisible();
  await condition.selectOption("NEEDS_MAINTENANCE");
  await remarks.fill("Loose terminal block.");

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset session" }).click();
  await expect(condition).toHaveValue("NEEDS_MAINTENANCE");
  await expect(remarks).toHaveValue("Loose terminal block.");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset session" }).click();
  await expect(condition).toHaveValue("FUNCTIONING");
  await expect(remarks).toHaveValue("");
});

test("Next and Rust backends return the same task status filter results", async ({ page, request }) => {
  test.skip(!RUST_BACKEND_URL, "Rust backend is not running");
  await login(page, STUDENT_EMAIL, "/student");

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const nextOrigin = new URL(page.url()).origin;
  const statuses = ["", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED", "ACCEPTED"];

  for (const status of statuses) {
    const query = status ? `?status=${status}` : "";
    const nextRes = await request.get(`${nextOrigin}/api/tasks${query}`, { headers: { cookie: cookieHeader } });
    const rustRes = await request.get(`${RUST_BACKEND_URL}/api/tasks${query}`, { headers: { cookie: cookieHeader } });
    expect(nextRes.status(), `Next /api/tasks${query}`).toBe(200);
    expect(rustRes.status(), `Rust /api/tasks${query}`).toBe(200);

    const nextBody = await nextRes.json();
    const rustBody = await rustRes.json();
    const summary = (body: { items?: Array<{ assignments?: Array<{ status: string }> }>; total?: number }) => ({
      total: body.total,
      statuses: (body.items ?? []).map((item) => item.assignments?.[0]?.status),
    });
    expect(summary(nextBody), `status=${status || "(none)"}`).toEqual(summary(rustBody));
  }
});

test("Next and Rust backends agree on unread notification counts", async ({ page, request }) => {
  test.skip(!RUST_BACKEND_URL, "Rust backend is not running");
  await login(page, STUDENT_EMAIL, "/student");

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const nextOrigin = new URL(page.url()).origin;

  for (const query of ["?page=1&pageSize=15", "?page=1&pageSize=15&unreadOnly=true"]) {
    const nextRes = await request.get(`${nextOrigin}/api/notifications${query}`, { headers: { cookie: cookieHeader } });
    const rustRes = await request.get(`${RUST_BACKEND_URL}/api/notifications${query}`, { headers: { cookie: cookieHeader } });
    expect(nextRes.status(), `Next /api/notifications${query}`).toBe(200);
    expect(rustRes.status(), `Rust /api/notifications${query}`).toBe(200);

    const nextBody = await nextRes.json();
    const rustBody = await rustRes.json();
    expect(nextBody.unread, `unread for ${query}`).toBe(rustBody.unread);
    expect(nextBody.total, `total for ${query}`).toBe(rustBody.total);
    expect(
      (nextBody.data ?? []).map((n: { id: string }) => n.id),
      `notification ids for ${query}`,
    ).toEqual((rustBody.data ?? []).map((n: { id: string }) => n.id));
  }
});
