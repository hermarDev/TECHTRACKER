import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

/**
 * P1 regression tests: live Pre-OJT completion, review state guards,
 * transactional registration, report validation, notification counts,
 * rate limiting and conversation pagination.
 */
const BASE = process.env.RUST_BACKEND_URL ?? "http://127.0.0.1:8080";
const RUN = Date.now().toString(36);
const PASSWORD = "P1Regress@2026";
const DEMO_PASSWORD = "TechTrack@2026";
const prisma = new PrismaClient();
let caseNumber = 0;

function nextRun() {
  caseNumber += 1;
  return `${RUN}-${caseNumber}`;
}

async function api(pathname: string, init: RequestInit = {}, cookie?: string, ip?: string) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (ip) headers.set("x-forwarded-for", ip);
  return fetch(`${BASE}${pathname}`, { ...init, headers, redirect: "manual" });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function cookieOf(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  const match = raw.match(/techtracker_session=([^;]+)/);
  expect(match).not.toBeNull();
  return `techtracker_session=${match![1]}`;
}

async function createVerifiedStudent(label: string) {
  const run = nextRun();
  const email = `p1-${label}-${run}@test.aclc.edu.ph`;
  const register = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: `P1 ${label} Student`,
      email,
      studentIdNo: `P1-${label}-${run}`,
      program: "BSIT",
      section: "BSIT-4A",
      password: PASSWORD,
      confirmPassword: PASSWORD,
    }),
  });
  expect(register.status).toBe(201);
  const queued = await prisma.emailOutbox.findFirst({
    where: { toEmail: email, category: "VERIFICATION" },
    orderBy: { createdAt: "desc" },
  });
  const token = queued?.body.match(/token=([a-f0-9]+)/)?.[1];
  expect(token).toBeTruthy();
  const verify = await api("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  expect(verify.status).toBe(200);
  return (await jsonOf(register)).user as { id: string; email: string };
}

async function login(email: string, password = PASSWORD) {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return cookieOf(res);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("P1 F10 live Pre-OJT completion", () => {
  it("ignores a stale cached flag until hours and tasks actually qualify", async () => {
    const student = await createVerifiedStudent("preojt");
    await prisma.user.update({
      where: { id: student.id },
      data: { preOjtCompleted: true, preOjtCompletedAt: new Date() },
    });
    const cookie = await login(student.email);
    const me = await api("/api/auth/me", {}, cookie);
    expect(((await jsonOf(me)).user as Record<string, unknown>).preOjtCompleted).toBe(false);
    const denied = await api(
      `/api/attendance/accreditation-pdf?studentId=${student.id}`,
      {},
      cookie
    );
    expect(denied.status).toBe(409);

    const batch = await prisma.batch.findFirstOrThrow({
      where: { name: "BSIT-4A Batch 2026-1" },
    });
    await prisma.attendanceLog.create({
      data: {
        studentId: student.id,
        batchId: batch.id,
        shiftDate: new Date("2026-11-01T08:00:00Z"),
        timeIn: new Date("2026-11-01T08:00:00Z"),
        timeOut: new Date("2026-11-01T18:00:00Z"),
        photoInKey: "attendance/p1.png",
        status: "APPROVED",
        recordedHours: 10,
        creditedHours: 100,
      },
    });
    const meAfter = await api("/api/auth/me", {}, cookie);
    expect(((await jsonOf(meAfter)).user as Record<string, unknown>).preOjtCompleted).toBe(true);
    const allowed = await api(
      `/api/attendance/accreditation-pdf?studentId=${student.id}`,
      {},
      cookie
    );
    expect(allowed.status).toBe(200);
  });
});

describe("P1 F11 login rate limiting", () => {
  it("returns 429 after 20 login attempts from one IP for one email", async () => {
    const email = `p1-burst-${nextRun()}@test.aclc.edu.ph`;
    const ip = `198.51.100.${caseNumber % 200 + 1}`;
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await api(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password: "WrongPassword1" }),
        },
        undefined,
        ip
      );
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
    expect(statuses[20]).toBe(429);
  });
});

describe("P1 F12 review state guards", () => {
  it("rejects reviewing an already-approved attendance record", async () => {
    const student = await createVerifiedStudent("att-review");
    const batch = await prisma.batch.findFirstOrThrow({
      where: { name: "BSIT-4A Batch 2026-1" },
    });
    const log = await prisma.attendanceLog.create({
      data: {
        studentId: student.id,
        batchId: batch.id,
        shiftDate: new Date("2026-11-02T08:00:00Z"),
        timeIn: new Date("2026-11-02T08:00:00Z"),
        timeOut: new Date("2026-11-02T17:00:00Z"),
        photoInKey: "attendance/p1.png",
        status: "APPROVED",
        recordedHours: 9,
        creditedHours: 9,
      },
    });
    const cookie = await login("coordinator@aclc-mandaue.edu.ph", DEMO_PASSWORD);
    const res = await api(
      `/api/attendance/${log.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "APPROVED" }) },
      cookie
    );
    expect(res.status).toBe(409);
  });

  it("requires assignmentId and preserves acceptedAt on task re-review", async () => {
    const student = await createVerifiedStudent("task-review");
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "coordinator@aclc-mandaue.edu.ph" },
    });
    const task = await prisma.task.create({
      data: {
        title: `P1 task ${RUN}`,
        instructions: "Review state guard",
        deadline: new Date("2026-12-31T00:00:00Z"),
        createdById: admin.id,
      },
    });
    const acceptedAt = new Date("2026-11-20T10:00:00Z");
    const assignment = await prisma.taskAssignment.create({
      data: {
        taskId: task.id,
        studentId: student.id,
        status: "SUBMITTED",
        acceptedAt,
      },
    });
    const cookie = await login(admin.email, DEMO_PASSWORD);
    const missing = await api(
      `/api/tasks/${task.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "RETURNED", studentRemark: "Try again" }) },
      cookie
    );
    expect(missing.status).toBe(400);

    const returned = await api(
      `/api/tasks/${task.id}/review`,
      { method: "POST", body: JSON.stringify({ assignmentId: assignment.id, status: "RETURNED", studentRemark: "Try again" }) },
      cookie
    );
    expect(returned.status).toBe(200);
    const after = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(after.acceptedAt?.toISOString()).toBe(acceptedAt.toISOString());
    const second = await api(
      `/api/tasks/${task.id}/review`,
      { method: "POST", body: JSON.stringify({ assignmentId: assignment.id, status: "ACCEPTED" }) },
      cookie
    );
    expect(second.status).toBe(409);
  });
});

describe("P1 F14 transactional registration", () => {
  it("commits user, verification outbox entry and audit log together", async () => {
    const email = `p1-tx-${nextRun()}@test.aclc.edu.ph`;
    const res = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Transactional Student",
        email,
        studentIdNo: `P1-TX-${RUN}`,
        program: "BSIT",
        section: "4A",
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
    });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const outbox = await prisma.emailOutbox.findFirst({
      where: { toEmail: email, category: "VERIFICATION" },
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "AUTH_REGISTER", entityId: user.id },
    });
    expect(outbox?.body).toContain("/api/auth/verify?token=");
    expect(audit).not.toBeNull();
  });
});

describe("P1 F15 report and notification validation", () => {
  it("returns 400 for invalid report dates and 409 for duplicate batch names", async () => {
    const cookie = await login("coordinator@aclc-mandaue.edu.ph", DEMO_PASSWORD);
    const badDate = await api(
      "/api/admin/reports?type=attendance&dateFrom=not-a-date",
      {},
      cookie
    );
    expect(badDate.status).toBe(400);

    const duplicate = await api(
      "/api/admin/batches",
      {
        method: "POST",
        body: JSON.stringify({
          name: "BSIT-4A Batch 2026-1",
          section: "BSIT-4A",
          academicYear: "2026-2027",
        }),
      },
      cookie
    );
    expect(duplicate.status).toBe(409);
  });

  it("reports only notifications actually marked read", async () => {
    const student = await createVerifiedStudent("notif");
    await prisma.notification.create({
      data: { userId: student.id, type: "SYSTEM_ALERT", title: "P1", body: "P1 notice" },
    });
    const cookie = await login(student.email);
    const res = await api(
      "/api/notifications",
      { method: "PATCH", body: JSON.stringify({ ids: ["bogus-notification-id"] }) },
      cookie
    );
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toMatchObject({ markedRead: 0 });
  });
});

describe("P1 F16 conversation pagination", () => {
  it("returns page-sized conversation windows and a total count", async () => {
    const student = await createVerifiedStudent("convs");
    for (let i = 0; i < 7; i++) {
      const conv = await prisma.conversation.create({
        data: { type: "DIRECT", title: `P1 thread ${i} ${RUN}` },
      });
      await prisma.conversationMember.create({
        data: { conversationId: conv.id, userId: student.id },
      });
    }
    const cookie = await login(student.email);
    const first = await api("/api/messages?page=1&pageSize=5", {}, cookie);
    expect(first.status).toBe(200);
    const firstBody = await jsonOf(first);
    expect(firstBody.total).toBe(7);
    expect((firstBody.conversations as unknown[]).length).toBe(5);

    const second = await api("/api/messages?page=2&pageSize=5", {}, cookie);
    const secondBody = await jsonOf(second);
    expect((secondBody.conversations as unknown[]).length).toBe(2);
  });
});
