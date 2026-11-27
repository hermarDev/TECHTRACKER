/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { normalizePagination, ALLOWED_PAGE_SIZES } from "@/lib/validation";
import { canUseMessaging } from "@/lib/rbac-policies";
import type { Role } from "@/lib/types";
import {
  generateInspectionSummaryCsv,
  generateInspectionSummaryPdf,
  generateOperationalReportCsv,
  generateOperationalReportPdf,
} from "@/lib/reports-export";
const BACKEND_URL = process.env.RUST_BACKEND_URL ?? "http://127.0.0.1:8080";
const DEMO_PASSWORD = "TechTrack@2026";
const mockJson = vi.fn();
let sessionCookie = "";
const emailById = new Map<string, string>();

beforeEach(() => {
  mockJson.mockReset();
  sessionCookie = "";
});

async function requestRust(path: string, method = "GET", body?: unknown): Promise<Response> {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", sessionCookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookieMatch = setCookie.match(/techtracker_session=([^;]*)/);
  if (cookieMatch) sessionCookie = cookieMatch[1] ? `techtracker_session=${cookieMatch[1]}` : "";
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    mockJson(await response.clone().json(), { status: response.status });
  } else {
    mockJson(null, { status: response.status });
  }
  return response;
}

function httpHandler(method: string, endpoint: string) {
  return async (request?: Request, context?: { params?: Promise<Record<string, string>> }) => {
    const requestUrl = request ? new URL(request.url) : null;
    let path = endpoint;
    if (context?.params) {
      const params = await context.params;
      for (const [key, value] of Object.entries(params)) path = path.replace(`[${key}]`, value);
    } else if (requestUrl) {
      path = `${requestUrl.pathname}${requestUrl.search}`;
    }
    if (context?.params && requestUrl?.search) path += requestUrl.search;
    const rawBody = method === "GET" || !request ? undefined : await request.text();
    let body: unknown = undefined;
    if (rawBody !== undefined && rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    return requestRust(path, method, body);
  };
}

async function authAs(role: Role, sub: string, batchId: string | null = null) {
  void batchId;
  const fallback = {
    SUPERADMIN: "superadmin@aclc-mandaue.edu.ph",
    ADMIN: "coordinator@aclc-mandaue.edu.ph",
    STUDENT: "edrich.bardilas@student.aclc.edu.ph",
  }[role];
  const email = emailById.get(sub) ?? fallback;
  const response = await requestRust("/api/auth/login", "POST", { email, password: DEMO_PASSWORD });
  if (response.status !== 200) throw new Error(`Rust login failed for ${email}: ${response.status}`);
}

async function expectAudit(action: string, entityType: string, search?: string) {
  await authAs("SUPERADMIN", superadminId);
  const query = new URLSearchParams({ page: "1", pageSize: "50", action, entityType });
  if (search) query.set("search", search);
  const response = await requestRust(`/api/superadmin/audit?${query}`);
  const body = await response.json();
  expect(response.status).toBe(200);
  return (body.data as Array<{ action: string; entityType: string; entityId: string }>).some(
    (entry) => entry.action === action && entry.entityType === entityType && (!search || entry.entityId.includes(search))
  );
}

function jsonBody(call: any[] | undefined) {
  if (!call) return null;
  return call[0];
}
function lastStatus(call: any[] | undefined) {
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
  async function login(email: string) {
    const response = await requestRust("/api/auth/login", "POST", { email, password: DEMO_PASSWORD });
    if (response.status !== 200) throw new Error(`Rust login failed for ${email}: ${response.status}`);
    return (await response.json()).user as { id: string };
  }

  superadminId = (await login("superadmin@aclc-mandaue.edu.ph")).id;
  emailById.set(superadminId, "superadmin@aclc-mandaue.edu.ph");
  adminId = (await login("coordinator@aclc-mandaue.edu.ph")).id;
  emailById.set(adminId, "coordinator@aclc-mandaue.edu.ph");
  studentId = (await login("edrich.bardilas@student.aclc.edu.ph")).id;
  emailById.set(studentId, "edrich.bardilas@student.aclc.edu.ph");
  const otherStudentIds = [
    ["michelle.estoy@student.aclc.edu.ph", await login("michelle.estoy@student.aclc.edu.ph")],
    ["joan.inting@student.aclc.edu.ph", await login("joan.inting@student.aclc.edu.ph")],
  ] as const;
  for (const [email, user] of otherStudentIds) emailById.set(user.id, email);

  await authAs("ADMIN", adminId);
  await authAs("SUPERADMIN", superadminId);
  const roomsResponse = await requestRust("/api/superadmin/rooms");
  const rooms = ((await roomsResponse.json()).rooms ?? []) as Array<{ id: string; name: string; units: Array<{ id: string }> }>;
  const lab1 = rooms.find((room) => room.name === "Computer Lab 1");
  const lab2 = rooms.find((room) => room.name === "Computer Lab 2");
  if (!lab1 || !lab2) throw new Error("Seed data missing: Computer Lab 1 or Computer Lab 2");
  roomLab1Id = lab1.id;
  roomLab1UnitIds = lab1.units.map((unit) => unit.id);
  roomLab2Id = lab2.id;
  roomLab2UnitIdList = lab2.units.map((unit) => unit.id);
  roomLab2UnitIds = roomLab2UnitIdList[0];

  await authAs("ADMIN", adminId);
  const conversationsResponse = await requestRust("/api/messages?page=1&pageSize=50");
  const conversations = ((await conversationsResponse.json()).conversations ?? []) as Array<{ id: string; members: Array<{ userId: string }> }>;
  const conversation = conversations.find((entry) => entry.members.some((member) => member.userId === studentId));
  if (!conversation) throw new Error("Seed data missing: coordinator and student conversation");
  convId = conversation.id;
  const nonMemberStudent = otherStudentIds.map(([, user]) => user).find((user) => !conversation.members.some((member) => member.userId === user.id));
  if (!nonMemberStudent) throw new Error("Seed data missing: no non-member ACTIVE student found");
  nonMemberStudentId = nonMemberStudent.id;

  await authAs("SUPERADMIN", superadminId);
  const attendanceResponse = await requestRust("/api/attendance?page=1&pageSize=50");
  const attendanceItems = ((await attendanceResponse.json()).items ?? []) as Array<{ id: string; studentId: string }>;
  const attendance = attendanceItems.find((item) => item.studentId === studentId);
  if (!attendance) throw new Error("Seed data missing: attendance record for the primary student");
  const escalationResponse = await requestRust(`/api/attendance/${attendance.id}/escalate`, "POST", {
    summary: "Domain C integration fixture",
    policyDetails: "Fixture case for Rust HTTP integration coverage.",
  });
  const escalationBody = await escalationResponse.json();
  if (escalationResponse.status !== 201 || !escalationBody.escalation?.id) {
    throw new Error(`Could not create escalation fixture: ${escalationResponse.status}`);
  }
  escalationId = escalationBody.escalation.id;
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
// Route integration tests use the Rust HTTP API.
// ===========================================================================

describe("Domain C — GET /api/inspections/rooms (A-Z ordering)", () => {
  it("returns rooms sorted A-Z with units sorted A-Z for an admin", async () => {
    await authAs("ADMIN", adminId);
    const GET = httpHandler("GET", "/api/inspections/rooms");
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
    const GET = httpHandler("GET", "/api/inspections/rooms");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const POST = httpHandler("POST", "/api/inspections");
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
    const GET = httpHandler("GET", "/api/inspections");
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
    const GET = httpHandler("GET", "/api/inspections");
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
    const create = httpHandler("POST", "/api/inspections");
    const createReq = new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: roomLab1Id, items: [{ unitId: roomLab1UnitIds[0], condition: "FUNCTIONING", remarks: null, photoKey: null }] }),
    });
    await create(createReq as any);
    const created = jsonBody(mockJson.mock.lastCall);
    const inspectionId = created?.inspection?.id ?? created?.id;
    await authAs("ADMIN", adminId);
    const review = httpHandler("POST", "/api/inspections/[id]/review");
    await review(new Request("http://localhost/api/inspections/x/review", { method: "POST" }) as any, { params: { id: inspectionId } } as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
  });
});

describe("Domain C — POST /api/messages (SuperAdmin blocked)", () => {
  it("returns 403 when SuperAdmin attempts to GET conversations", async () => {
    await authAs("SUPERADMIN", superadminId);
    const GET = httpHandler("GET", "/api/messages");
    const req = new Request("http://localhost/api/messages");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("returns 403 when SuperAdmin attempts to send a message", async () => {
    await authAs("SUPERADMIN", superadminId);
    const POST = httpHandler("POST", "/api/messages");
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
    const POST = httpHandler("POST", "/api/messages");
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
    const postDirect = httpHandler("POST", "/api/messages/[conversationId]");
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
    const GET = httpHandler("GET", "/api/notifications");
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
    const GET = httpHandler("GET", "/api/superadmin/escalations");
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
    const GET = httpHandler("GET", "/api/superadmin/escalations");
    const req = new Request("http://localhost/api/superadmin/escalations");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});

describe("Domain C — PATCH /api/superadmin/escalations (ruling propagation)", () => {
  it("lets SuperAdmin rule on an escalation (APPROVED/UPHELD/DISMISSED)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/escalations");
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
    const escalation = body?.escalation as { sourceId: string; sourceType: string; student: { id: string } };
    expect(escalation.sourceType).toBe("ATTENDANCE");
    await authAs("STUDENT", escalation.student.id);
    const attendanceResponse = await requestRust("/api/attendance?page=1&pageSize=50");
    const attendance = ((await attendanceResponse.json()).items ?? []) as Array<{ id: string; status: string; reviewerId: string | null }>;
    const log = attendance.find((entry) => entry.id === escalation.sourceId);
    expect(log?.status).toBe("APPROVED");
    expect(log?.reviewerId).toBe(superadminId);

    // Notification + AuditLog are written.
    const notifications = await requestRust("/api/notifications?page=1&pageSize=50");
    const notificationRows = ((await notifications.json()).data ?? []) as Array<{ type: string; body: string }>;
    expect(notificationRows.some((entry) => entry.type === "ESCALATION")).toBe(true);
    expect(await expectAudit("ESCALATION_RULED", "EscalationCase", escalationId)).toBe(true);
  });
  it("rejects an empty ruling note (400)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/escalations");
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
    const PATCH = httpHandler("PATCH", "/api/superadmin/escalations");
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
    const PATCH = httpHandler("PATCH", "/api/superadmin/escalations");
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
    const GET = httpHandler("GET", "/api/superadmin/config");
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
    const GET = httpHandler("GET", "/api/superadmin/config");
    await GET();
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("PATCH updates allowSelfRegistration and restores it (AuditLog written)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/config");

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

    expect(await expectAudit("SYSTEM_CONFIG_UPDATED", "SystemConfig")).toBe(true);
  });
  it("PATCH rejects invalid values (400)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/config");
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
    const GET = httpHandler("GET", "/api/superadmin/admins");
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
    const GET = httpHandler("GET", "/api/superadmin/admins");
    const req = new Request("http://localhost/api/superadmin/admins");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("PATCH toggles admin status to DEACTIVATED and back to ACTIVE with AuditLog", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/admins");

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

    expect(await expectAudit("ADMIN_STATUS_CHANGED", "User", adminId)).toBe(true);
  });
  it("POST creates a new admin account (201) and AuditLog", async () => {
    await authAs("SUPERADMIN", superadminId);
    const POST = httpHandler("POST", "/api/superadmin/admins");
    const adminEmail = `domain-c-test-${Date.now()}@aclc-mandaue.edu.ph`;
    const req = new Request("http://localhost/api/superadmin/admins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Domain C Test Admin",
        email: adminEmail,
        password: "Str0ngPass!2026",
      }),
    });
    await POST(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(201);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(body?.admin?.role).toBe("ADMIN");
    expect(body?.admin?.status).toBe("ACTIVE");
    expect(await expectAudit("ADMIN_CREATED", "User", body?.admin?.id)).toBe(true);
  });
});

describe("Domain C — GET/POST/PATCH /api/superadmin/rooms (LabRoom & ComputerUnit config)", () => {
  it("GET returns rooms with units, both sorted A-Z", async () => {
    await authAs("SUPERADMIN", superadminId);
    const GET = httpHandler("GET", "/api/superadmin/rooms");
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
    const GET = httpHandler("GET", "/api/superadmin/rooms");
    await GET();
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
  it("PATCH updates a room field and restores it (AuditLog written)", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/rooms");
    const roomsResponse = await requestRust("/api/superadmin/rooms");
    const rooms = ((await roomsResponse.json()).rooms ?? []) as Array<{ id: string; capacity: number }>;
    const originalCapacity = rooms.find((room) => room.id === roomLab2Id)!.capacity;

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

    expect(await expectAudit("LABROOM_UPDATED", "LabRoom", roomLab2Id)).toBe(true);
  });
  it("PATCH updates a computer unit condition and restores it", async () => {
    await authAs("SUPERADMIN", superadminId);
    const PATCH = httpHandler("PATCH", "/api/superadmin/rooms");
    const roomsResponse = await requestRust("/api/superadmin/rooms");
    const rooms = ((await roomsResponse.json()).rooms ?? []) as Array<{ units: Array<{ id: string; condition: string }> }>;
    const originalCondition = rooms.flatMap((room) => room.units).find((unit) => unit.id === roomLab2UnitIds)!.condition;

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
      body: JSON.stringify({ unitId: roomLab2UnitIds, condition: originalCondition }),
    });
    await PATCH(req2 as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
  });
});

describe("Domain C — GET /api/superadmin/audit (search + entityType filter + pagination)", () => {
  it("returns paginated audit logs newest-first with page meta", async () => {
    await authAs("SUPERADMIN", superadminId);
    const GET = httpHandler("GET", "/api/superadmin/audit");
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
    const GET = httpHandler("GET", "/api/superadmin/audit");
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
    const GET = httpHandler("GET", "/api/superadmin/audit");
    const req = new Request("http://localhost/api/superadmin/audit?page=1&pageSize=15&search=ESCALATION");
    await GET(req as any);
    const body = jsonBody(mockJson.mock.lastCall);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(200);
    expect(Array.isArray(body?.data)).toBe(true);
  });
  it("returns 403 for Admins", async () => {
    await authAs("ADMIN", adminId);
    const GET = httpHandler("GET", "/api/superadmin/audit");
    const req = new Request("http://localhost/api/superadmin/audit");
    await GET(req as any);
    expect(lastStatus(mockJson.mock.lastCall)).toBe(403);
  });
});
