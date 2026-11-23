/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { normalizePagination, ALLOWED_PAGE_SIZES } from "@/lib/validation";
import { canUseMessaging } from "@/lib/rbac";
import {
  generateInspectionSummaryCsv,
  generateInspectionSummaryPdf,
  generateOperationalReportCsv,
  generateOperationalReportPdf,
} from "@/lib/reports-export";
import { signSessionJwt } from "@/lib/auth";
import { db } from "@/lib/db";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn() })) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: any, init: any = {}) => ({ status: init.status ?? 200, body })),
  },
}));

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const mockGet = vi.fn();
const mockCookies = vi.mocked(cookies);
const mockJson = vi.mocked(NextResponse.json);

beforeEach(() => {
  mockGet.mockReset();
  mockJson.mockReset();
  mockCookies.mockReset();
  mockCookies.mockImplementation(
    async () => ({ get: mockGet }) as unknown as Awaited<ReturnType<typeof cookies>>
  );
});

type Role = "SUPERADMIN" | "ADMIN" | "STUDENT";

async function authAs(role: Role, sub: string, batchId: string | null = null) {
  const token = await signSessionJwt({
    sub,
    email: `${sub}@test.local`,
    fullName: "Test User",
    role: role as any,
    batchId,
  });
  mockGet.mockReturnValue({ value: token });
}

function jsonBody(call: [any, any?] | undefined) {
  if (!call) return null;
  return call[0];
}
function lastStatus(call: [any, any?] | undefined) {
  if (!call) return null;
  return call[1]?.status ?? 200;
}

let superadminId = "";
let adminId = "";
let studentId = "";
let roomLab1Id = "";
let roomLab1UnitIds: string[] = [];
let roomLab2Id = "";
let roomLab2UnitIds = "";
let roomLab2UnitIdList: string[] = [];
let convId = "";
let escalationId = "";
let nonMemberStudentId = "";

beforeAll(async () => {
  const superadmin = await db.user.findUnique({ where: { email: "superadmin@aclc-mandaue.edu.ph" } });
  const admin = await db.user.findUnique({ where: { email: "coordinator@aclc-mandaue.edu.ph" } });
  const student = await db.user.findUnique({ where: { email: "edrich.bardilas@student.aclc.edu.ph" } });
  const lab1 = await db.labRoom.findUnique({ where: { name: "Computer Lab 1" }, include: { units: { orderBy: { unitCode: "asc" } } } });
  const lab2 = await db.labRoom.findUnique({ where: { name: "Computer Lab 2" }, include: { units: { orderBy: { unitCode: "asc" } } } });
  if (!admin || !student) throw new Error("Seed data missing: coordinator or student");
  const conv = await db.conversation.findFirst({ where: { AND: [{ members: { some: { userId: admin.id } } }, { members: { some: { userId: student.id } } }] } });
  if (!conv) throw new Error("Seed data missing: coordinator and student conversation");
  const esc = await db.escalationCase.findFirst();
  const nonMemberStudent = await db.user.findFirst({
    where: {
      role: "STUDENT",
      status: "ACTIVE",
      conversationMembers: { none: { conversationId: conv.id } },
    },
  });

  superadminId = superadmin!.id;
  adminId = admin!.id;
  studentId = student!.id;
  roomLab1Id = lab1!.id;
  roomLab1UnitIds = lab1!.units.map((u) => u.id);
  roomLab2Id = lab2!.id;
  roomLab2UnitIdList = lab2!.units.map((u) => u.id);
  roomLab2UnitIds = roomLab2UnitIdList[0];
  convId = conv!.id;
  escalationId = esc!.id;
  if (!nonMemberStudent) throw new Error("Seed data missing: no non-member ACTIVE student found");
  nonMemberStudentId = nonMemberStudent.id;
});

describe("Domain C — lib: pagination", () => {
  it("normalizes to page 1, size 15 by default", () => {
    const p = normalizePagination(undefined, undefined);
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(15);
    expect(p.skip).toBe(0);
    expect(p.take).toBe(15);
  });
  it("accepts 15 / 25 / 50 and rejects others", () => {
    expect(normalizePagination(1, 15).pageSize).toBe(15);
    expect(normalizePagination(2, 25).pageSize).toBe(25);
    expect(normalizePagination(3, 50).pageSize).toBe(50);
    expect(normalizePagination(1, 999).pageSize).toBe(15);
    expect(normalizePagination(1, "abc").pageSize).toBe(15);
  });
  it("computes skip from page and pageSize", () => {
    expect(normalizePagination(2, 25).skip).toBe(25);
    expect(normalizePagination(3, 50).skip).toBe(100);
  });
  it("ALLOWED_PAGE_SIZES is exactly [15, 25, 50]", () => {
    expect(ALLOWED_PAGE_SIZES).toEqual([15, 25, 50]);
  });
});

describe("Domain C — lib: rbac messaging", () => {
  it("blocks SuperAdmin from messaging, allows Admin and Student", () => {
    expect(canUseMessaging("SUPERADMIN")).toBe(false);
    expect(canUseMessaging("ADMIN")).toBe(true);
    expect(canUseMessaging("STUDENT")).toBe(true);
  });
});

describe("Domain C — lib: reports-export CSV", () => {
  it("generates a CSV with header row from papaparse", () => {
    const rows = [
      { room: "Computer Lab 1", unitCode: "PC-01", condition: "NEEDS_MAINTENANCE", remarks: "port loose", photoKey: null, inspectedAt: "2026-11-14", inspector: "admin" },
    ];
    const csv = generateInspectionSummaryCsv(rows);
    expect(csv).toContain("room,unitCode,condition,remarks,photoKey,inspectedAt,inspector");
    expect(csv).toContain("Computer Lab 1");
    expect(csv).toContain("NEEDS_MAINTENANCE");
  });
  it("generates an empty CSV string for no rows", () => {
    expect(generateInspectionSummaryCsv([])).toBe("");
  });
});

describe("Domain C — lib: reports-export PDF", () => {
  it("generates a PDF Buffer (%PDF header)", () => {
    const pdf = generateInspectionSummaryPdf([
      { room: "Computer Lab 1", unitCode: "PC-01", condition: "Functioning", remarks: "", photoKey: null, inspectedAt: "2026-11-14", inspector: "admin" },
    ]);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
  it("generates operational report CSV and PDF", () => {
    const rows = [
      { batch: "BSIT-4A", section: "BSIT-4A", metric: "Attendance", value: "42", label: "completed" },
    ];
    const csv = generateOperationalReportCsv(rows);
    expect(csv).toContain("BSIT-4A");
    const pdf = generateOperationalReportPdf(rows);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});

// ===========================================================================
// ROUTE INTEGRATION TESTS (mocked cookies/NextResponse, live DB)
// ===========================================================================

describe("Domain C — GET /api/inspections/rooms (A-Z ordering)", () => {
  it("returns rooms sorted A-Z with units sorted A-Z for an admin", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/inspections/rooms/route");
    await GET();
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(Array.isArray(body?.rooms)).toBe(true);
    const names = body!.rooms.map((r: any) => r.name);
    expect(names).toEqual([...names].sort());
    for (const r of body!.rooms) {
      const codes = r.units.map((u: any) => u.unitCode);
      expect(codes).toEqual([...codes].sort());
    }
  });
  it("returns 401 without a session", async () => {
    mockGet.mockReturnValue(undefined);
    const { GET } = await import("@/app/api/inspections/rooms/route");
    await GET();
    expect(lastStatus(mockJson.mock.lastCall)).toBe(401);
  });
});

describe("Domain C — POST /api/inspections (defect remarks required)", () => {
  const baseItems = (roomId: string, unitId: string, condition: string, remarks?: string) => ({
    roomId,
    summaryNote: "Weekly lab audit",
    items: [{ unitId, condition, remarks, photoKey: null }],
  });
  it("returns 400 when NEEDS_MAINTENANCE item lacks remarks", async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseItems(roomLab1Id, roomLab1UnitIds[0], "NEEDS_MAINTENANCE")),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(400);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(String(body?.error ?? "")).toMatch(/remarks/);
  });
  it("returns 400 when NEEDS_REPAIR item lacks remarks", async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseItems(roomLab1Id, roomLab1UnitIds[0], "NEEDS_REPAIR")),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(400);
  });
  it("creates inspection (201) when FUNCTIONING has no remarks", async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseItems(roomLab1Id, roomLab1UnitIds[0], "FUNCTIONING")),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(201);
  });
  it("creates inspection (201) when NEEDS_MAINTENANCE has remarks", async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseItems(roomLab1Id, roomLab1UnitIds[0], "NEEDS_MAINTENANCE", "Port 9 loose, reseat cable")),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(201);
  });
  it("dispatches NO urgent alert or repair ticket in the response", async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseItems(roomLab1Id, roomLab1UnitIds[0], "NEEDS_REPAIR", "Cracked casing, no power")),
    });
    await POST(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    const payload = JSON.stringify(body);
    expect(payload).not.toMatch(/urgent|alert|ticket|dispatch|work.?order/i);
  });
  it("returns 403 for a student inspecting a room not assigned to them", async () => {
    await authAs("STUDENT", studentId);
    const { POST } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseItems(roomLab2Id, roomLab2UnitIds, "FUNCTIONING")),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});

describe("Domain C — GET /api/inspections (pagination)", () => {
  beforeAll(async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/inspections/route");
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/inspections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: roomLab1Id,
          summaryNote: `batch seed ${i}`,
          items: [{ unitId: roomLab1UnitIds[i % roomLab1UnitIds.length], condition: "FUNCTIONING", remarks: null, photoKey: null }],
        }),
      });
      await POST(req as any);
    }
  });
  it("returns paginated inspections newest-first with page meta", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/inspections/route");
    const req = new Request("http://localhost/api/inspections?page=1&pageSize=15");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(Array.isArray(body?.data)).toBe(true);
    expect(body?.page).toBe(1);
    expect(body?.pageSize).toBe(15);
    expect(typeof body?.total).toBe("number");
    expect(typeof body?.totalPages).toBe("number");
  });
  it("accepts pageSize 25 and 50", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/inspections/route");
    for (const size of [25, 50]) {
      const req = new Request(`http://localhost/api/inspections?page=1&pageSize=${size}`);
      await GET(req as any);
      const body = jsonBody(mockJson.mock.lastCall);
      expect(body?.pageSize).toBe(size);
    }
  });
});

describe("Domain C — POST /api/inspections/[id]/review (Admin marks REVIEWED)", () => {
  it("marks an inspection REVIEWED (200)", async () => {
    await authAs("ADMIN", adminId);
    const { POST: create } = await import("@/app/api/inspections/route");
    const createReq = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: roomLab1Id, items: [{ unitId: roomLab1UnitIds[0], condition: "FUNCTIONING", remarks: null, photoKey: null }] }),
    });
    await create(createReq as any);
    const created = jsonBody(mockJson.mock.lastCall);
    const inspectionId = created?.inspection?.id ?? created?.id;
    await authAs("ADMIN", adminId);
    const { POST: review } = await import("@/app/api/inspections/[id]/review/route");
    await review(new Request("http://localhost/api/inspections/x/review", { method: "POST" }) as any, { params: { id: inspectionId } } as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
  });
});

describe("Domain C — POST /api/messages (SuperAdmin blocked)", () => {
  it("returns 403 when SuperAdmin attempts to GET conversations", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/messages/route");
    const req = new Request("http://localhost/api/messages");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("returns 403 when SuperAdmin attempts to send a message", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { POST } = await import("@/app/api/messages/route");
    const req = new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: convId, body: "hello" }),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("allows an Admin to send a message (200/201)", async () => {
    await authAs("ADMIN", adminId);
    const { POST } = await import("@/app/api/messages/route");
    const req = new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: convId, body: "hello from admin" }),
    });
    await POST(req as any);
    expect([200, 201, 202]).toContain(lastStatus(mockJson.mock.lastCall));
  });
  it("returns 403 when a non-member posts into a conversation", async () => {
    await authAs("STUDENT", nonMemberStudentId);
    const { POST: postDirect } = await import("@/app/api/messages/[conversationId]/route");
    const req = new Request(`http://localhost/api/messages/${convId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "sneaky direct message" }),
    });
    await postDirect(req as any, { params: Promise.resolve({ conversationId: convId }) } as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});

describe("Domain C — GET /api/notifications (pagination + newest first)", () => {
  it("returns paginated notifications with 15/25/50 page meta", async () => {
    await authAs("STUDENT", studentId);
    const { GET } = await import("@/app/api/notifications/route");
    for (const size of [15, 25, 50]) {
      const req = new Request(`http://localhost/api/notifications?page=1&pageSize=${size}`);
      await GET(req as any);
      const body = jsonBody(mockJson.mock.lastCall);
      expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
      expect(body?.pageSize).toBe(size);
      expect(Array.isArray(body?.data)).toBe(true);
      const dates = (body?.data ?? []).map((n: any) => new Date(n.createdAt).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    }
  });
});

describe("Domain C — GET /api/superadmin/escalations (paginated queue)", () => {
  it("returns paginated escalations newest-first for SuperAdmin", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/escalations/route");
    const req = new Request("http://localhost/api/superadmin/escalations?page=1&pageSize=15");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(Array.isArray(body?.data)).toBe(true);
    expect(body?.pageSize).toBe(15);
    const ids = (body?.data ?? []).map((e: any) => e.id);
    expect(ids).toContain(escalationId);
    const dates = (body?.data ?? []).map((e: any) => new Date(e.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
  it("returns 403 for a non-SuperAdmin", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/superadmin/escalations/route");
    const req = new Request("http://localhost/api/superadmin/escalations");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});

describe("Domain C — PATCH /api/superadmin/escalations (ruling propagation)", () => {
  it("lets SuperAdmin rule on an escalation (APPROVED/UPHELD/DISMISSED)", async () => {
    // Keep the test repeatable: restore the case to OPEN before ruling.
    await db.escalationCase.update({
      where: { id: escalationId },
      data: { status: "OPEN", rulingNote: null, ruledById: null, ruledAt: null },
    });
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/escalations/route");
    const req = new Request("http://localhost/api/superadmin/escalations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ escalationId, status: "APPROVED", rulingNote: "Policy upheld, credited hours adjusted." }),
    });
    await PATCH(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(body?.escalation?.status).toBe("APPROVED");
    expect(body?.escalation?.rulingNote).toContain("Policy upheld");

    // Propagation: the linked attendance log is finalised with the ruling.
    const esc = await db.escalationCase.findUnique({ where: { id: escalationId } });
    const log = await db.attendanceLog.findUnique({ where: { id: esc!.sourceId } });
    expect(log?.status).toBe("APPROVED");
    expect(log?.reviewerId).toBe(superadminId);

    // Notification + AuditLog are written.
    const notif = await db.notification.findFirst({
      where: { type: "ESCALATION", userId: esc!.studentId },
      orderBy: { createdAt: "desc" },
    });
    expect(notif).toBeTruthy();
    const audit = await db.auditLog.findFirst({
      where: { action: "ESCALATION_RULED", entityType: "EscalationCase", entityId: escalationId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });
  it("rejects an empty ruling note (400)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/escalations/route");
    const req = new Request("http://localhost/api/superadmin/escalations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ escalationId, status: "DISMISSED", rulingNote: "   " }),
    });
    await PATCH(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(400);
  });
  it("rejects a second ruling on an already-ruled case (409)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/escalations/route");
    const req = new Request("http://localhost/api/superadmin/escalations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ escalationId, status: "DISMISSED", rulingNote: "double ruling attempt" }),
    });
    await PATCH(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(409);
  });
  it("returns 403 when an Admin attempts to rule", async () => {
    await authAs("ADMIN", adminId);
    const { PATCH } = await import("@/app/api/superadmin/escalations/route");
    const req = new Request("http://localhost/api/superadmin/escalations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ escalationId, status: "DISMISSED", rulingNote: "not allowed" }),
    });
    await PATCH(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});

describe("Domain C — GET/PATCH /api/superadmin/config (SystemConfig)", () => {
  it("GET returns the singleton config", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/config/route");
    await GET();
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(body?.config?.requiredPreOjtHours).toBe(100);
    expect(Array.isArray(body?.config?.taskCategories)).toBe(true);
    expect(["EXACT_MINUTES", "ROUND_DOWN_15", "ROUND_UP_15", "NEAREST_QUARTER"]).toContain(body?.config?.creditRoundingRule);
    expect(typeof body?.config?.allowSelfRegistration).toBe("boolean");
  });
  it("GET is blocked for Admins (403)", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/superadmin/config/route");
    await GET();
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("PATCH updates allowSelfRegistration and restores it (AuditLog written)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/config/route");

    const req1 = new Request("http://localhost/api/superadmin/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowSelfRegistration: false }),
    });
    await PATCH(req1 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(jsonBody(mockJson.mock.lastCall)?.config?.allowSelfRegistration).toBe(false);

    const req2 = new Request("http://localhost/api/superadmin/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowSelfRegistration: true }),
    });
    await PATCH(req2 as any);
    expect(jsonBody(mockJson.mock.lastCall)?.config?.allowSelfRegistration).toBe(true);

    const audit = await db.auditLog.findFirst({
      where: { action: "SYSTEM_CONFIG_UPDATED", entityType: "SystemConfig" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });
  it("PATCH rejects invalid values (400)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/config/route");
    const req = new Request("http://localhost/api/superadmin/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requiredPreOjtHours: -5 }),
    });
    await PATCH(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(400);
  });
});

describe("Domain C — GET/PATCH /api/superadmin/admins (Admin CRUD)", () => {
  it("GET returns a paginated list of admins (only for SuperAdmin)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/admins/route");
    const req = new Request("http://localhost/api/superadmin/admins?page=1&pageSize=15");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(body?.pageSize).toBe(15);
    expect(Array.isArray(body?.data)).toBe(true);
    expect((body?.data ?? []).some((a: any) => a.id === adminId)).toBe(true);
    for (const a of body?.data ?? []) {
      expect(a.role ?? "ADMIN").toBeDefined();
      expect(typeof a.coordinatedBatches).toBe("number");
    }
  });
  it("GET is blocked for Admins (403)", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/superadmin/admins/route");
    const req = new Request("http://localhost/api/superadmin/admins");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("PATCH toggles admin status to DEACTIVATED and back to ACTIVE with AuditLog", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/admins/route");

    const req1 = new Request("http://localhost/api/superadmin/admins", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminId, status: "DEACTIVATED" }),
    });
    await PATCH(req1 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(jsonBody(mockJson.mock.lastCall)?.admin?.status).toBe("DEACTIVATED");

    const req2 = new Request("http://localhost/api/superadmin/admins", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminId, status: "ACTIVE" }),
    });
    await PATCH(req2 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(jsonBody(mockJson.mock.lastCall)?.admin?.status).toBe("ACTIVE");

    const audit = await db.auditLog.findFirst({
      where: { action: "ADMIN_STATUS_CHANGED", entityType: "User", entityId: adminId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });
  it("POST creates a new admin account (201) and AuditLog", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { POST } = await import("@/app/api/superadmin/admins/route");
    const req = new Request("http://localhost/api/superadmin/admins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Domain C Test Admin",
        email: "domain-c-test.admin@aclc-mandaue.edu.ph",
        password: "Str0ngPass!2026",
      }),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(201);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(body?.admin?.role).toBe("ADMIN");
    expect(body?.admin?.status).toBe("ACTIVE");
    const created = await db.user.findUnique({ where: { email: "domain-c-test.admin@aclc-mandaue.edu.ph" } });
    expect(created?.role).toBe("ADMIN");
    if (created) {
      await db.user.delete({ where: { id: created.id } });
    }
  });
});

describe("Domain C — GET/POST/PATCH /api/superadmin/rooms (LabRoom & ComputerUnit config)", () => {
  it("GET returns rooms with units, both sorted A-Z", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/rooms/route");
    await GET();
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    const names = (body?.rooms ?? []).map((r: any) => r.name);
    expect(names).toEqual([...names].sort());
    for (const r of body?.rooms ?? []) {
      const codes = r.units.map((u: any) => u.unitCode);
      expect(codes).toEqual([...codes].sort());
    }
  });
  it("GET is blocked for Admins (403)", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/superadmin/rooms/route");
    await GET();
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("PATCH updates a room field and restores it (AuditLog written)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/rooms/route");
    const room = await db.labRoom.findUnique({ where: { id: roomLab2Id } });
    const originalCapacity = room!.capacity;

    const req1 = new Request("http://localhost/api/superadmin/rooms", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: roomLab2Id, capacity: originalCapacity + 2 }),
    });
    await PATCH(req1 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);

    const req2 = new Request("http://localhost/api/superadmin/rooms", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: roomLab2Id, capacity: originalCapacity }),
    });
    await PATCH(req2 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);

    const audit = await db.auditLog.findFirst({
      where: { action: "LABROOM_UPDATED", entityType: "LabRoom", entityId: roomLab2Id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });
  it("PATCH updates a computer unit condition and restores it", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { PATCH } = await import("@/app/api/superadmin/rooms/route");
    const unit = await db.computerUnit.findUnique({ where: { id: roomLab2UnitIds } });

    const req1 = new Request("http://localhost/api/superadmin/rooms", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: roomLab2UnitIds, condition: "NEEDS_MAINTENANCE" }),
    });
    await PATCH(req1 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(jsonBody(mockJson.mock.lastCall)?.unit?.condition).toBe("NEEDS_MAINTENANCE");

    const req2 = new Request("http://localhost/api/superadmin/rooms", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: roomLab2UnitIds, condition: unit!.condition }),
    });
    await PATCH(req2 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
  });
});

describe("Domain C — GET /api/superadmin/audit (search + entityType filter + pagination)", () => {
  it("returns paginated audit logs newest-first with page meta", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/audit/route");
    const req = new Request("http://localhost/api/superadmin/audit?page=1&pageSize=15");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(body?.pageSize).toBe(15);
    expect(Array.isArray(body?.data)).toBe(true);
    const dates = (body?.data ?? []).map((l: any) => new Date(l.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
  it("filters by entityType and returns only matching rows", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/audit/route");
    const req = new Request("http://localhost/api/superadmin/audit?page=1&pageSize=25&entityType=EscalationCase");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(body?.pageSize).toBe(25);
    for (const row of body?.data ?? []) {
      expect(row.entityType).toBe("EscalationCase");
    }
  });
  it("supports the search parameter", async () => {
    await authAs("SUPERADMIN", superadminId);
    const { GET } = await import("@/app/api/superadmin/audit/route");
    const req = new Request("http://localhost/api/superadmin/audit?page=1&pageSize=15&search=ESCALATION");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(Array.isArray(body?.data)).toBe(true);
  });
  it("returns 403 for Admins", async () => {
    await authAs("ADMIN", adminId);
    const { GET } = await import("@/app/api/superadmin/audit/route");
    const req = new Request("http://localhost/api/superadmin/audit");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});
