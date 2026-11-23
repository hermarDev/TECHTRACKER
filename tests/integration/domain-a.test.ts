import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Domain A integration tests (Flows 01W-04W, 12W, 02S-04S).
 * Route handlers are invoked directly with mocked `next/headers` cookies
 * against the real local PostgreSQL 16 instance (Docker 127.0.0.1:5444).
 */

const mockStore = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => {
    const map = mockStore.cookies;
    return {
      get: (name: string) =>
        map.has(name) ? { name, value: map.get(name) as string } : undefined,
      set: (name: string, value: string) => {
        map.set(name, value);
      },
      delete: (name: string) => {
        map.delete(name);
      },
      getAll: () => Array.from(map, ([name, value]) => ({ name, value })),
    };
  },
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, hashPassword, signSessionJwt } from "@/lib/auth";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { GET as verifyGET, POST as verifyPOST } from "@/app/api/auth/verify/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as forgotPOST } from "@/app/api/auth/forgot-password/route";
import { POST as resetPOST } from "@/app/api/auth/reset-password/route";
import { GET as meGET } from "@/app/api/auth/me/route";
import {
  GET as profileGET,
  PATCH as profilePATCH,
  PUT as profilePUT,
} from "@/app/api/profile/route";
import { GET as outboxGET } from "@/app/api/dev/outbox/route";
import DashboardPage from "@/app/dashboard/page";

const BASE = "http://localhost:3219";
const RUN = Date.now().toString(36);
const TEST_PASSWORD = "CorrectHorse1";
const NEW_PASSWORD = "FreshPass2026";

function jsonRequest(
  path: string,
  body?: unknown,
  method: "POST" | "PUT" | "PATCH" | "GET" = "POST"
): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function registerBody(overrides: Partial<Record<string, string>> = {}) {
  return {
    fullName: "Test Student",
    email: `reg-${RUN}@test.aclc.edu.ph`,
    studentIdNo: `SID-REG-${RUN}`,
    program: "BSIT",
    section: "BSIT-4A",
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
    ...overrides,
  };
}

async function createVerifiedStudent(label: string) {
  const email = `stu-${label}-${RUN}@test.aclc.edu.ph`;
  return db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      fullName: "Test Student",
      role: "STUDENT",
      status: "ACTIVE",
      studentIdNo: `SID-${label}-${RUN}`,
      program: "BSIT",
      section: "BSIT-4A",
    },
  });
}

async function loginViaApi(email: string, password: string) {
  return loginPOST(jsonRequest("/api/auth/login", { email, password }));
}

function captureSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const value = match?.[1] ?? null;
  if (value) mockStore.cookies.set(SESSION_COOKIE_NAME, value);
  return value;
}

async function establishSessionFor(user: {
  id: string;
  email: string;
  fullName: string;
  role: "STUDENT" | "ADMIN" | "SUPERADMIN";
  batchId: string | null;
}) {
  const token = await signSessionJwt({
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    batchId: user.batchId,
  });
  mockStore.cookies.set(SESSION_COOKIE_NAME, token);
}

function outboxFor(email: string) {
  return db.emailOutbox.findMany({ where: { toEmail: email }, orderBy: { createdAt: "asc" } });
}

async function latestTokenFromOutbox(email: string, category: string): Promise<string> {
  const emails = await db.emailOutbox.findMany({
    where: { toEmail: email, category },
    orderBy: { createdAt: "desc" },
  });
  expect(emails.length).toBeGreaterThan(0);
  const match = emails[0].body.match(/token=([a-f0-9]+)/);
  expect(match).not.toBeNull();
  return match![1];
}

beforeEach(() => {
  mockStore.cookies.clear();
  redirectMock.mockClear();
});

afterEach(async () => {
  await db.user.deleteMany({ where: { email: { contains: RUN } } });
  await db.emailOutbox.deleteMany({ where: { toEmail: { contains: RUN } } });
  mockStore.cookies.clear();
});

describe("02S Student Self-Registration", () => {
  it("creates a pending-verification STUDENT account and queues a verification email (no role picker)", async () => {
    const res = await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    expect(res.status).toBe(201);
    const body = await jsonOf(res);

    const user = await db.user.findUnique({ where: { email: registerBody().email } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("STUDENT");
    expect(user!.status).toBe("PENDING_VERIFICATION");
    expect(user!.passwordHash).not.toBe(TEST_PASSWORD);
    expect(body).toMatchObject({ user: { email: registerBody().email, role: "STUDENT" } });

    const emails = await outboxFor(registerBody().email);
    expect(emails.some((e) => e.category === "VERIFICATION" && e.body.includes("/api/auth/verify?token="))).toBe(true);
  });

  it("rejects duplicate email with 409", async () => {
    expect((await registerPOST(jsonRequest("/api/auth/register", registerBody()))).status).toBe(201);
    const res = await registerPOST(
      jsonRequest("/api/auth/register", registerBody({ studentIdNo: `SID-DUP-${RUN}` }))
    );
    expect(res.status).toBe(409);
  });

  it("rejects duplicate student ID number with 409", async () => {
    expect((await registerPOST(jsonRequest("/api/auth/register", registerBody()))).status).toBe(201);
    const res = await registerPOST(
      jsonRequest("/api/auth/register", registerBody({ email: `reg2-${RUN}@test.aclc.edu.ph` }))
    );
    expect(res.status).toBe(409);
  });

  it("rejects mismatched passwords with 400", async () => {
    const res = await registerPOST(
      jsonRequest("/api/auth/register", registerBody({ confirmPassword: "Different123" }))
    );
    expect(res.status).toBe(400);
  });
});

describe("Email verification (02S)", () => {
  it("activates the account with a valid token and rejects reuse", async () => {
    await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    const email = registerBody().email;
    const token = await latestTokenFromOutbox(email, "VERIFICATION");

    const res = await verifyPOST(jsonRequest("/api/auth/verify", { token }));
    expect(res.status).toBe(200);

    const user = await db.user.findUnique({ where: { email } });
    expect(user!.status).toBe("ACTIVE");
    expect(user!.verificationToken).toBeNull();

    const reuse = await verifyPOST(jsonRequest("/api/auth/verify", { token }));
    expect(reuse.status).toBe(400);
  });

  it("rejects an invalid token with 400", async () => {
    const res = await verifyPOST(jsonRequest("/api/auth/verify", { token: "not-a-real-token" }));
    expect(res.status).toBe(400);
  });

  it("GET verify redirects to login with a status marker", async () => {
    await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    const token = await latestTokenFromOutbox(registerBody().email, "VERIFICATION");
    const res = await verifyGET(new Request(`${BASE}/api/auth/verify?token=${token}`));
    expect([200, 302, 307]).toContain(res.status);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
  });
});

describe("03S Sign-In, 5-attempt lockout and security alert", () => {
  it("signs in a verified student, sets the session cookie, and /api/auth/me resolves the session", async () => {
    const student = await createVerifiedStudent("login");
    const res = await loginViaApi(student.email, TEST_PASSWORD);
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body).toMatchObject({ user: { email: student.email, role: "STUDENT" } });
    expect(captureSessionCookie(res)).not.toBeNull();

    const me = await meGET(new Request(`${BASE}/api/auth/me`, { method: "GET" }));
    expect(me.status).toBe(200);
    expect(await jsonOf(me)).toMatchObject({ user: { email: student.email } });
  });

  it("rejects an unverified account with 403", async () => {
    await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    const res = await loginViaApi(registerBody().email, TEST_PASSWORD);
    expect(res.status).toBe(403);
  });

  it("rejects wrong credentials with 401 without revealing account existence", async () => {
    const student = await createVerifiedStudent("wrongpw");
    const res = await loginViaApi(student.email, "WrongPassword1");
    expect(res.status).toBe(401);
    expect((await jsonOf(res)).remainingAttempts).toBe(4);

    const unknown = await loginViaApi(`ghost-${RUN}@test.aclc.edu.ph`, TEST_PASSWORD);
    expect(unknown.status).toBe(401);
  });

  it("locks the account after 5 consecutive failed attempts, emails a SECURITY_ALERT, and rejects even the correct password while locked", async () => {
    const student = await createVerifiedStudent("lockout");

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await loginViaApi(student.email, `BadPass${attempt}`);
      expect(res.status).toBe(401);
    }
    const fifth = await loginViaApi(student.email, "BadPass5");
    expect(fifth.status).toBe(423);
    const fifthBody = await jsonOf(fifth);
    expect(String(fifthBody.error)).toMatch(/locked/i);
    expect(Number(fifthBody.remainingMinutes)).toBeGreaterThan(0);

    const emails = await outboxFor(student.email);
    expect(emails.some((e) => e.category === "SECURITY_ALERT" && /locked/i.test(e.subject))).toBe(true);

    const afterLock = await loginViaApi(student.email, TEST_PASSWORD);
    expect(afterLock.status).toBe(423);

    const user = await db.user.findUnique({ where: { id: student.id } });
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(user!.failedLoginCount).toBe(5);
  });

  it("clears failure counters and allows sign-in after lockout expiry", async () => {
    const student = await createVerifiedStudent("unlock");
    for (let i = 0; i < 5; i++) await loginViaApi(student.email, "BadPass");
    await db.user.update({
      where: { id: student.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const res = await loginViaApi(student.email, TEST_PASSWORD);
    expect(res.status).toBe(200);
    const user = await db.user.findUnique({ where: { id: student.id } });
    expect(user!.failedLoginCount).toBe(0);
    expect(user!.lockedUntil).toBeNull();
  });

  it("POST /api/auth/logout clears the session", async () => {
    const student = await createVerifiedStudent("logout");
    await establishSessionFor(student);
    const res = await logoutPOST(jsonRequest("/api/auth/logout"));
    expect(res.status).toBe(200);
    // The browser removes the cookie because it is set empty with Max-Age=0.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toMatch(/Max-Age=0/i);
    // Simulate the browser applying the removal to the cookie store.
    mockStore.cookies.set(SESSION_COOKIE_NAME, "");
    expect(mockStore.cookies.get(SESSION_COOKIE_NAME)).toBe("");
  });
});

describe("04S Password Recovery (1-hour reset token TTL)", () => {
  it("queues a password reset email with a token that expires in ~1 hour", async () => {
    const student = await createVerifiedStudent("forgot");
    const res = await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    expect(res.status).toBe(200);

    const token = await latestTokenFromOutbox(student.email, "PASSWORD_RESET");
    expect(token.length).toBeGreaterThanOrEqual(16);

    const record = await db.passwordResetToken.findFirst({ where: { userId: student.id } });
    expect(record).not.toBeNull();
    expect(record!.usedAt).toBeNull();
    const diffMs = record!.expiresAt.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(55 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  it("responds generically for unknown emails (no user enumeration)", async () => {
    const res = await forgotPOST(
      jsonRequest("/api/auth/forgot-password", { email: `ghost-${RUN}@test.aclc.edu.ph` })
    );
    expect(res.status).toBe(200);
    expect((await db.emailOutbox.findMany({ where: { toEmail: `ghost-${RUN}@test.aclc.edu.ph` } })).length).toBe(0);
  });

  it("resets the password with a valid token, invalidates the token, and allows login with the new password", async () => {
    const student = await createVerifiedStudent("reset");
    await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    const token = await latestTokenFromOutbox(student.email, "PASSWORD_RESET");

    const res = await resetPOST(
      jsonRequest("/api/auth/reset-password", { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    );
    expect(res.status).toBe(200);

    const record = await db.passwordResetToken.findFirst({ where: { userId: student.id } });
    expect(record!.usedAt).not.toBeNull();

    const reuse = await resetPOST(
      jsonRequest("/api/auth/reset-password", { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    );
    expect(reuse.status).toBe(400);

    expect((await loginViaApi(student.email, TEST_PASSWORD)).status).toBe(401);
    expect((await loginViaApi(student.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("rejects an expired reset token (1-hour TTL enforced)", async () => {
    const student = await createVerifiedStudent("expired");
    await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    const token = await latestTokenFromOutbox(student.email, "PASSWORD_RESET");

    await db.passwordResetToken.updateMany({
      where: { userId: student.id },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const res = await resetPOST(
      jsonRequest("/api/auth/reset-password", { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    );
    expect(res.status).toBe(400);
  });
});

describe("04W Role Dashboard Router", () => {
  it("redirects unauthenticated visitors to /login", async () => {
    await DashboardPage();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects STUDENT to /student", async () => {
    const student = await createVerifiedStudent("router");
    await establishSessionFor(student);
    await DashboardPage();
    expect(redirectMock).toHaveBeenCalledWith("/student");
  });

  it("redirects ADMIN to /admin and SUPERADMIN to /superadmin", async () => {
    const admin = await db.user.create({
      data: {
        email: `admin-${RUN}@test.aclc.edu.ph`,
        passwordHash: "x",
        fullName: "Coordinator User",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    await establishSessionFor(admin);
    await DashboardPage();
    expect(redirectMock).toHaveBeenCalledWith("/admin");

    const superadmin = await db.user.create({
      data: {
        email: `super-${RUN}@test.aclc.edu.ph`,
        passwordHash: "x",
        fullName: "System Owner",
        role: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    await establishSessionFor(superadmin);
    await DashboardPage();
    expect(redirectMock).toHaveBeenCalledWith("/superadmin");
  });
});

describe("12W Profile Management", () => {
  it("returns the authenticated profile and updates contact details", async () => {
    const student = await createVerifiedStudent("profile");
    await establishSessionFor(student);

    const got = await profileGET(new Request(`${BASE}/api/profile`, { method: "GET" }));
    expect(got.status).toBe(200);
    expect(await jsonOf(got)).toMatchObject({ user: { email: student.email } });

    const put = await profilePUT(
      jsonRequest("/api/profile", { fullName: "Test Student", phone: "+639170000000" }, "PUT")
    );
    expect(put.status).toBe(200);
    const updated = await db.user.findUnique({ where: { id: student.id } });
    expect(updated!.phone).toBe("+639170000000");
  });

  it("requires authentication for the profile API", async () => {
    const res = await profileGET(new Request(`${BASE}/api/profile`, { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("changes password only with a correct current password (>= 8 chars, match)", async () => {
    const student = await createVerifiedStudent("pwchange");
    await establishSessionFor(student);

    const wrongCurrent = await profilePATCH(
      jsonRequest("/api/profile", {
        currentPassword: "NotTheCurrent1",
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }, "PATCH")
    );
    expect(wrongCurrent.status).toBe(400);

    const tooShort = await profilePATCH(
      jsonRequest("/api/profile", {
        currentPassword: TEST_PASSWORD,
        newPassword: "short",
        confirmPassword: "short",
      }, "PATCH")
    );
    expect(tooShort.status).toBe(400);

    const mismatch = await profilePATCH(
      jsonRequest("/api/profile", {
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: "Different999",
      }, "PATCH")
    );
    expect(mismatch.status).toBe(400);

    const ok = await profilePATCH(
      jsonRequest("/api/profile", {
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }, "PATCH")
    );
    expect(ok.status).toBe(200);

    mockStore.cookies.clear();
    expect((await loginViaApi(student.email, TEST_PASSWORD)).status).toBe(401);
    expect((await loginViaApi(student.email, NEW_PASSWORD)).status).toBe(200);
  });
});

describe("Dev outbox viewer (zero-subscription email preview)", () => {
  it("lists queued emails with categories, including verification, reset and lockout alerts", async () => {
    await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    const student = await createVerifiedStudent("outbox");
    await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    for (let i = 0; i < 5; i++) await loginViaApi(student.email, "BadPass");

    const res = await outboxGET(new Request(`${BASE}/api/dev/outbox`, { method: "GET" }));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    const emails = body.emails as Array<{ category: string; toEmail: string }>;
    const mine = emails.filter((e) => e.toEmail.includes(RUN));
    const categories = new Set(mine.map((e) => e.category));
    expect(categories.has("VERIFICATION")).toBe(true);
    expect(categories.has("PASSWORD_RESET")).toBe(true);
    expect(categories.has("SECURITY_ALERT")).toBe(true);
  });
});
