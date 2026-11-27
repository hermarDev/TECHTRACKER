import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * P0 regression tests: outbox removal, session revocation, file authorization,
 * inspection scoping, coordinator boundaries, and duplicate time-in handling.
 */
const BASE = process.env.RUST_BACKEND_URL ?? "http://127.0.0.1:8080";
const RUN = Date.now().toString(36);
const PASSWORD = "P0Regress@2026";
const prisma = new PrismaClient();
let caseNumber = 0;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function nextRun() {
  caseNumber += 1;
  return `${RUN}-${caseNumber}`;
}

async function api(
  pathname: string,
  init: RequestInit = {},
  cookie?: string
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${BASE}${pathname}`, { ...init, headers, redirect: "manual" });
}

async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function sessionCookieOf(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  const match = raw.match(/techtracker_session=([^;]+)/);
  expect(match).not.toBeNull();
  return `techtracker_session=${match![1]}`;
}

async function createVerifiedStudent(label: string) {
  const run = nextRun();
  const email = `p0-${label}-${run}@test.aclc.edu.ph`;
  const register = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: `P0 ${label} Student`,
      email,
      studentIdNo: `P0-${label}-${run}`,
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
  return (await jsonBody(register)).user as { id: string; email: string };
}

async function login(email: string, password = PASSWORD): Promise<string> {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return sessionCookieOf(res);
}

async function batchA() {
  const batch = await prisma.batch.findFirst({ where: { name: "BSIT-4A Batch 2026-1" } });
  expect(batch).not.toBeNull();
  return batch!;
}

beforeEach(() => {
  caseNumber += 1;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("P0 F2 session revocation", () => {
  it("rejects a session cookie after logout", async () => {
    const student = await createVerifiedStudent("logout");
    const cookie = await login(student.email);
    expect((await api("/api/auth/me", {}, cookie)).status).toBe(200);

    expect((await api("/api/auth/logout", { method: "POST" }, cookie)).status).toBe(200);
    expect((await api("/api/auth/me", {}, cookie)).status).toBe(401);
  });

  it("rejects a session cookie after a password reset", async () => {
    const student = await createVerifiedStudent("reset");
    const cookie = await login(student.email);
    const forgot = await api("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: student.email }),
    });
    expect(forgot.status).toBe(200);
    const queued = await prisma.emailOutbox.findFirst({
      where: { toEmail: student.email, category: "PASSWORD_RESET" },
      orderBy: { createdAt: "desc" },
    });
    const token = queued?.body.match(/token=([a-f0-9]+)/)?.[1];
    const reset = await api("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token,
        password: "P0FreshPass2026",
        confirmPassword: "P0FreshPass2026",
      }),
    });
    expect(reset.status).toBe(200);
    expect((await api("/api/auth/me", {}, cookie)).status).toBe(401);
  });
});

describe("P0 F3 file authorization", () => {
  it("does not serve another student's attendance photo", async () => {
    const owner = await createVerifiedStudent("file-owner");
    const stranger = await createVerifiedStudent("file-stranger");
    const batch = await batchA();
    const key = `attendance/p0-${RUN}-${caseNumber}.png`;
    const filePath = path.join(process.cwd(), ".storage", key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, PNG);
    await prisma.attendanceLog.create({
      data: {
        studentId: owner.id,
        batchId: batch.id,
        shiftDate: new Date(),
        timeIn: new Date(),
        timeOut: new Date(),
        photoInKey: key,
        status: "APPROVED",
        recordedHours: 8,
        creditedHours: 8,
      },
    });

    const ownerCookie = await login(owner.email);
    const strangerCookie = await login(stranger.email);
    const ownerRes = await api(`/api/files/${key}`, {}, ownerCookie);
    expect(ownerRes.status).toBe(200);
    const strangerRes = await api(`/api/files/${key}`, {}, strangerCookie);
    expect(strangerRes.status).toBe(404);
  });
});

describe("P0 F4 inspection scoping and review guard", () => {
  it("lists only assigned rooms and blocks another coordinator's review", async () => {
    const student = await createVerifiedStudent("insp");
    const other = await createVerifiedStudent("insp-other");
    const adminA = await prisma.user.findUniqueOrThrow({
      where: { email: "coordinator@aclc-mandaue.edu.ph" },
    });
    const adminB = await prisma.user.findUniqueOrThrow({
      where: { email: "techstaff@aclc-mandaue.edu.ph" },
    });
    const roomA = await prisma.labRoom.create({
      data: {
        name: `P0 Room A ${RUN}-${caseNumber}`,
        building: "P0",
        assignedAdminId: adminA.id,
        assignedStudentId: student.id,
      },
    });
    const roomB = await prisma.labRoom.create({
      data: {
        name: `P0 Room B ${RUN}-${caseNumber}`,
        building: "P0",
        assignedAdminId: adminB.id,
        assignedStudentId: other.id,
      },
    });
    const inspA = await prisma.inspection.create({
      data: { roomId: roomA.id, inspectorId: student.id, status: "SUBMITTED" },
    });
    const inspB = await prisma.inspection.create({
      data: { roomId: roomB.id, inspectorId: student.id, status: "SUBMITTED" },
    });

    const studentCookie = await login(student.email);
    const list = await api("/api/inspections?pageSize=50", {}, studentCookie);
    expect(list.status).toBe(200);
    const listed = ((await jsonBody(list)).data as Array<{ id: string }>).map((row) => row.id);
    expect(listed).toContain(inspA.id);
    expect(listed).not.toContain(inspB.id);

    const adminBCookie = await login("techstaff@aclc-mandaue.edu.ph", "TechTrack@2026");
    const crossReview = await api(`/api/inspections/${inspA.id}/review`, { method: "POST" }, adminBCookie);
    expect(crossReview.status).toBe(403);

    const adminACookie = await login("coordinator@aclc-mandaue.edu.ph", "TechTrack@2026");
    expect((await api(`/api/inspections/${inspA.id}/review`, { method: "POST" }, adminACookie)).status).toBe(200);
    expect((await api(`/api/inspections/${inspA.id}/review`, { method: "POST" }, adminACookie)).status).toBe(409);
  });
});

describe("P0 F5 coordinator boundaries", () => {
  it("rejects an ADMIN reassigning a batch to another coordinator", async () => {
    const adminA = await prisma.user.findUniqueOrThrow({
      where: { email: "coordinator@aclc-mandaue.edu.ph" },
    });
    const adminB = await prisma.user.findUniqueOrThrow({
      where: { email: "techstaff@aclc-mandaue.edu.ph" },
    });
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { name: "BSIT-4A Batch 2026-1" },
    });
    const cookie = await login(adminA.email, "TechTrack@2026");
    const res = await api(
      `/api/admin/batches/${batch.id}`,
      { method: "PATCH", body: JSON.stringify({ coordinatorId: adminB.id }) },
      cookie
    );
    expect(res.status).toBe(403);
  });
});

describe("A3 Manila shift day storage", () => {
  it("stores an RFC3339 punch on the local calendar day", async () => {
    const student = await createVerifiedStudent("shift-day");
    const batch = await batchA();
    await prisma.user.update({ where: { id: student.id }, data: { batchId: batch.id } });
    const schedule = await prisma.schedule.findFirstOrThrow({
      where: { batchId: batch.id },
    });
    const cookie = await login(student.email);

    const form = new FormData();
    form.set("action", "TIME_IN");
    form.set("scheduleId", schedule.id);
    form.set("shiftDate", "2026-11-26T16:30:00Z");
    form.set("photo", new Blob([PNG], { type: "image/png" }), "shift.png");
    const punched = await api("/api/attendance", { method: "POST", body: form }, cookie);
    expect(punched.status).toBe(201);

    const stored = await prisma.attendanceLog.findFirstOrThrow({
      where: { studentId: student.id, timeOut: null },
      orderBy: { createdAt: "desc" },
    });
    expect(stored.shiftDate.toISOString().slice(0, 10)).toBe("2026-11-27");

    const previousDay = await prisma.attendanceLog.create({
      data: {
        studentId: student.id,
        batchId: batch.id,
        shiftDate: new Date("2026-11-26T00:00:00Z"),
        timeIn: new Date("2026-11-26T08:00:00Z"),
        photoInKey: "attendance/a3-previous.png",
      },
    });
    expect(previousDay.id).toBeTruthy();
  });
});

describe("A8 fresh-database schema", () => {
  it("has the partial unique index for open attendance shifts", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'AttendanceLog' AND indexname = 'AttendanceLog_one_open_per_student_day'
    `;
    expect(rows).toHaveLength(1);
  });
});

describe("P0 F8 duplicate simultaneous time-ins", () => {
  it("accepts exactly one of two concurrent time-ins for the same day", async () => {
    const student = await createVerifiedStudent("timein");
    const batch = await batchA();
    await prisma.user.update({ where: { id: student.id }, data: { batchId: batch.id } });
    const schedule = await prisma.schedule.findFirstOrThrow({
      where: { batchId: batch.id, startTime: "08:00" },
    });
    const cookie = await login(student.email);
    const shiftDate = new Date().toISOString().slice(0, 10);

    const submit = () => {
      const form = new FormData();
      form.set("action", "TIME_IN");
      form.set("scheduleId", schedule.id);
      form.set("shiftDate", shiftDate);
      form.set("photo", new Blob([PNG], { type: "image/png" }), "p0.png");
      return api("/api/attendance", { method: "POST", body: form }, cookie);
    };

    const responses = await Promise.all([submit(), submit()]);
    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
    const open = await prisma.attendanceLog.count({
      where: { studentId: student.id, timeOut: null },
    });
    expect(open).toBe(1);
  });
});
