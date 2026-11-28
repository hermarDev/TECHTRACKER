import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
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
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
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

describe("A4 long punch hours", () => {
  it("caps and flags a time-out hours after the scheduled shift", async () => {
    const student = await createVerifiedStudent("long-punch");
    const batch = await prisma.batch.findFirstOrThrow({
      where: { name: "BSIT-4A Batch 2026-1" },
    });
    await prisma.user.update({ where: { id: student.id }, data: { batchId: batch.id } });
    const schedule = await prisma.schedule.findFirstOrThrow({
      where: { batchId: batch.id, startTime: "08:00" },
    });
    const log = await prisma.attendanceLog.create({
      data: {
        studentId: student.id,
        batchId: batch.id,
        scheduleId: schedule.id,
        shiftDate: new Date("2026-11-20T00:00:00Z"),
        timeIn: new Date("2026-11-20T08:00:00Z"),
        photoInKey: "attendance/a4.png",
      },
    });
    const cookie = await login(student.email);
    const form = new FormData();
    form.set("action", "TIME_OUT");
    form.set("attendanceId", log.id);
    form.set("photo", new Blob([PNG], { type: "image/png" }), "out.png");
    const res = await api("/api/attendance", { method: "POST", body: form }, cookie);
    expect(res.status).toBe(200);
    const stored = await prisma.attendanceLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(stored.recordedHours).toBeLessThanOrEqual(4.5);
    expect(stored.isIrregular).toBe(true);
  });
});

describe("A6 failed task submit leaves no file", () => {
  it("rejects an accepted assignment before writing attachments", async () => {
    const student = await createVerifiedStudent("orphan");
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "coordinator@aclc-mandaue.edu.ph" },
    });
    const task = await prisma.task.create({
      data: {
        title: `A6 task ${RUN}`,
        instructions: "Orphan check",
        deadline: new Date("2026-12-31T00:00:00Z"),
        createdById: admin.id,
      },
    });
    await prisma.taskAssignment.create({
      data: { taskId: task.id, studentId: student.id, status: "ACCEPTED" },
    });
    const dir = path.join(process.cwd(), ".storage", "tasks");
    const before = await fs.readdir(dir).catch(() => []);
    const cookie = await login(student.email);
    const form = new FormData();
    form.set("summary", "Late submission");
    form.set("attachments", new Blob([PNG], { type: "image/png" }), "late.png");
    const res = await api(
      `/api/tasks/${task.id}/submit`,
      { method: "POST", body: form },
      cookie
    );
    expect(res.status).toBe(409);
    const after = await fs.readdir(dir).catch(() => []);
    expect(after.length).toBe(before.length);
  });
});

describe("A12 inspection unit scope", () => {
  it("rejects a unit from another room", async () => {
    const student = await createVerifiedStudent("unit-scope");
    const roomA = await prisma.labRoom.create({
      data: { name: `A12-A ${RUN}`, building: "A12", assignedStudentId: student.id },
    });
    const roomB = await prisma.labRoom.create({
      data: { name: `A12-B ${RUN}`, building: "A12", assignedStudentId: student.id },
    });
    const unitB = await prisma.computerUnit.create({
      data: { roomId: roomB.id, unitCode: `A12-${RUN}` },
    });
    const cookie = await login(student.email);
    const res = await api(
      "/api/inspections",
      {
        method: "POST",
        body: JSON.stringify({
          roomId: roomA.id,
          items: [{ unitId: unitB.id, condition: "FUNCTIONING" }],
        }),
      },
      cookie
    );
    expect(res.status).toBe(400);
  });
});

describe("A5 attachment ownership", () => {
  it("rejects a message attachment key owned by another student", async () => {
    const owner = await createVerifiedStudent("file-owner");
    const stranger = await createVerifiedStudent("file-stranger");
    const cookie = await login(stranger.email);
    const res = await api(
      "/api/messages",
      {
        method: "POST",
        body: JSON.stringify({
          body: "Look at this",
          attachmentKey: `uploads/${owner.id}/stolen.png`,
        }),
      },
      cookie
    );
    expect(res.status).toBe(400);
  });

  it("rejects an inspection photo key owned by another student", async () => {
    const owner = await createVerifiedStudent("insp-owner");
    const stranger = await createVerifiedStudent("insp-stranger");
    const room = await prisma.labRoom.create({
      data: {
        name: `A5 Room ${RUN}`,
        building: "A5",
        assignedStudentId: stranger.id,
      },
    });
    const unit = await prisma.computerUnit.create({
      data: { roomId: room.id, unitCode: `A5-${RUN}` },
    });
    const cookie = await login(stranger.email);
    const res = await api(
      "/api/inspections",
      {
        method: "POST",
        body: JSON.stringify({
          roomId: room.id,
          items: [
            {
              unitId: unit.id,
              condition: "FUNCTIONING",
              photoKey: `uploads/${owner.id}/stolen.png`,
            },
          ],
        }),
      },
      cookie
    );
    expect(res.status).toBe(400);
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

describe("E2E S1 task resubmission version increment", () => {
  it("increments TaskSubmission.version from 1 to 2 on resubmission", async () => {
    const student = await createVerifiedStudent("resubmit-ver");
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "coordinator@aclc-mandaue.edu.ph" },
    });
    const task = await prisma.task.create({
      data: {
        title: `P1 Resubmit ${RUN}`,
        instructions: "Verify version increment",
        deadline: new Date("2026-12-31T00:00:00Z"),
        createdById: admin.id,
      },
    });
    const assignment = await prisma.taskAssignment.create({
      data: { taskId: task.id, studentId: student.id, status: "IN_PROGRESS" },
    });

    const studentCookie = await login(student.email);
    const form1 = new FormData();
    form1.set("summary", "First submission");
    form1.set("attachments", new Blob([PNG], { type: "image/png" }), "v1.png");
    const sub1 = await api(`/api/tasks/${task.id}/submit`, { method: "POST", body: form1 }, studentCookie);
    expect(sub1.status).toBe(201);

    const adminCookie = await login(admin.email, DEMO_PASSWORD);
    const ret = await api(
      `/api/tasks/${task.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({ assignmentId: assignment.id, status: "RETURNED", studentRemark: "Revise" }),
      },
      adminCookie
    );
    expect(ret.status).toBe(200);

    const form2 = new FormData();
    form2.set("summary", "Second submission");
    form2.set("attachments", new Blob([PNG], { type: "image/png" }), "v2.png");
    const sub2 = await api(`/api/tasks/${task.id}/submit`, { method: "POST", body: form2 }, studentCookie);
    expect(sub2.status).toBe(201);

    const detail = await api(`/api/tasks/${task.id}`, {}, studentCookie);
    expect(detail.status).toBe(200);
    const body = (await jsonOf(detail)) as {
      task: { assignments: Array<{ submissions: Array<{ version: number }> }> };
    };
    const versions = body.task.assignments[0].submissions.map((s) => s.version).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2]);
  });
});

describe("E2E A1 attendance search by studentId", () => {
  it("matches attendance records by studentId as well as fullName", async () => {
    const student = await createVerifiedStudent("att-search");
    const userRow = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    const batch = await prisma.batch.findFirstOrThrow({
      where: { name: "BSIT-4A Batch 2026-1" },
    });
    await prisma.attendanceLog.create({
      data: {
        studentId: student.id,
        batchId: batch.id,
        shiftDate: new Date("2026-11-21T00:00:00Z"),
        timeIn: new Date("2026-11-21T08:00:00Z"),
        photoInKey: "attendance/a1.png",
        status: "PENDING",
      },
    });
    const adminCookie = await login("coordinator@aclc-mandaue.edu.ph", DEMO_PASSWORD);
    const res = await api(
      `/api/attendance?search=${encodeURIComponent(userRow.studentIdNo!)}`,
      {},
      adminCookie
    );
    expect(res.status).toBe(200);
    const body = (await jsonOf(res)) as {
      total: number;
      items: Array<{ student: { studentIdNo: string | null } }>;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items.some((row) => row.student.studentIdNo === userRow.studentIdNo)).toBe(true);
  });
});
