import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { roleDashboardPath } from "@/lib/rbac-policies";

/**
 * Domain A integration tests (Flows 01W-04W, 12W, 02S-04S).
 * Auth, profile and outbox flows run through the Rust HTTP API.
 */
const BASE = process.env.RUST_BACKEND_URL ?? "http://127.0.0.1:8080";
const RUN = Date.now().toString(36);
const TEST_PASSWORD = "CorrectHorse1";
const NEW_PASSWORD = "FreshPass2026";
const prisma = new PrismaClient();
let caseNumber = 0;
let sessionCookie = "";

async function requestApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  if (sessionCookie && !headers.has("cookie")) headers.set("cookie", sessionCookie);
  const response = await fetch(`${BASE}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.text() }),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/techtracker_session=([^;]*)/);
  if (match) sessionCookie = match[1] ? `techtracker_session=${match[1]}` : "";
  return response;
}

const registerPOST = requestApi;
const verifyGET = requestApi;
const verifyPOST = requestApi;
const loginPOST = requestApi;
const logoutPOST = requestApi;
const forgotPOST = requestApi;
const resetPOST = requestApi;
const meGET = requestApi;
const profileGET = requestApi;
const profilePATCH = requestApi;
const profilePUT = requestApi;

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
  const testRun = `${RUN}-${caseNumber}`;
  return {
    fullName: "Test Student",
    email: `reg-${testRun}@test.aclc.edu.ph`,
    studentIdNo: `SID-REG-${testRun}`,
    program: "BSIT",
    section: "BSIT-4A",
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
    ...overrides,
  };
}

async function createVerifiedStudent(label: string) {
  const testRun = `${RUN}-${caseNumber}`;
  const body = registerBody({
    fullName: "Test Student",
    email: `stu-${label}-${testRun}@test.aclc.edu.ph`,
    studentIdNo: `SID-${label}-${testRun}`,
  });
  const registration = await registerPOST(jsonRequest("/api/auth/register", body));
  expect(registration.status).toBe(201);
  const token = await latestTokenFromOutbox(body.email, "VERIFICATION");
  const verification = await verifyPOST(jsonRequest("/api/auth/verify", { token }));
  expect(verification.status).toBe(200);
  const result = await jsonOf(registration);
  return result.user as {
    id: string;
    email: string;
    fullName: string;
    role: "STUDENT";
    batchId: string | null;
  };
}

async function loginViaApi(email: string, password: string) {
  return loginPOST(jsonRequest("/api/auth/login", { email, password }));
}

function captureSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/techtracker_session=([^;]+)/);
  const value = match?.[1] ?? null;
  if (value) sessionCookie = `techtracker_session=${value}`;
  return value;
}

async function establishSessionFor(user: { email: string }) {
  const response = await loginViaApi(user.email, TEST_PASSWORD);
  expect(response.status).toBe(200);
}

async function outboxFor(email: string) {
  const emails = await prisma.emailOutbox.findMany({
    where: { toEmail: email },
    orderBy: { createdAt: "desc" },
  });
  return emails.map((entry) => ({
    toEmail: entry.toEmail,
    category: entry.category,
    subject: entry.subject,
    body: entry.body,
    createdAt: entry.createdAt.toISOString(),
  }));
}

async function latestTokenFromOutbox(email: string, category: string): Promise<string> {
  const emails = (await outboxFor(email)).filter((entry) => entry.category === category);
  expect(emails.length).toBeGreaterThan(0);
  const match = emails[0].body.match(/token=([a-f0-9]+)/);
  expect(match).not.toBeNull();
  return match![1];
}

beforeEach(() => {
  caseNumber += 1;
  sessionCookie = "";
});

afterEach(() => {
  sessionCookie = "";
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("02S Student Self-Registration", () => {
  it("creates a pending-verification STUDENT account and queues a verification email (no role picker)", async () => {
    const res = await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    expect(res.status).toBe(201);
    const body = await jsonOf(res);

    expect(body).toMatchObject({
      user: {
        email: registerBody().email,
        role: "STUDENT",
        status: "PENDING_VERIFICATION",
      },
    });
    expect(JSON.stringify(body)).not.toContain(TEST_PASSWORD);
    expect((body.user as Record<string, unknown>).passwordHash).toBeUndefined();

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

    expect(await jsonOf(res)).toMatchObject({ user: { email, status: "ACTIVE" } });

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

    const unknown = await loginViaApi(`ghost-${RUN}-${caseNumber}@test.aclc.edu.ph`, TEST_PASSWORD);
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
    expect(Number(fifthBody.remainingAttempts)).toBe(0);

    const emails = await outboxFor(student.email);
    expect(emails.some((e) => e.category === "SECURITY_ALERT" && /locked/i.test(e.subject))).toBe(true);

    const afterLock = await loginViaApi(student.email, TEST_PASSWORD);
    expect(afterLock.status).toBe(423);

  });

  it("clears failure counters after a successful sign-in", async () => {
    const student = await createVerifiedStudent("unlock");
    for (let i = 0; i < 4; i++) {
      expect((await loginViaApi(student.email, "BadPass")).status).toBe(401);
    }
    const res = await loginViaApi(student.email, TEST_PASSWORD);
    expect(res.status).toBe(200);
    const afterSuccess = await loginViaApi(student.email, "BadPass");
    expect(afterSuccess.status).toBe(401);
    expect((await jsonOf(afterSuccess)).remainingAttempts).toBe(4);
  });

  it("POST /api/auth/logout clears the session", async () => {
    const student = await createVerifiedStudent("logout");
    await establishSessionFor(student);
    const res = await logoutPOST(jsonRequest("/api/auth/logout"));
    expect(res.status).toBe(200);
    // The browser removes the cookie because it is set empty with Max-Age=0.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("techtracker_session=;");
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(sessionCookie).toBe("");
  });
});

describe("04S Password Recovery (1-hour reset token TTL)", () => {
  it("queues a one-hour password reset token", async () => {
    const student = await createVerifiedStudent("forgot");
    const res = await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    expect(res.status).toBe(200);
    expect(String((await jsonOf(res)).message)).toMatch(/expires in 1 hour/i);
    const emails = await outboxFor(student.email);
    const resetEmail = emails.find((entry) => entry.category === "PASSWORD_RESET");
    expect(resetEmail?.body).toMatch(/valid for 1 hour/i);
    expect(await latestTokenFromOutbox(student.email, "PASSWORD_RESET")).toMatch(/^[a-f0-9]{16,}$/);
    const estimatedExpiry = new Date(resetEmail!.createdAt).getTime() + 60 * 60 * 1000;
    const remainingMs = estimatedExpiry - Date.now();
    expect(remainingMs).toBeGreaterThan(55 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  it("responds generically for unknown emails (no user enumeration)", async () => {
    const unknownEmail = `ghost-${RUN}-${caseNumber}@test.aclc.edu.ph`;
    const res = await forgotPOST(
      jsonRequest("/api/auth/forgot-password", { email: unknownEmail })
    );
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).message).toMatch(/if an account exists/i);
    expect((await outboxFor(unknownEmail)).length).toBe(0);
  });

  it("resets the password with a valid token, invalidates the token, and allows login with the new password", async () => {
    const student = await createVerifiedStudent("reset");
    await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    const token = await latestTokenFromOutbox(student.email, "PASSWORD_RESET");

    const res = await resetPOST(
      jsonRequest("/api/auth/reset-password", { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    );
    expect(res.status).toBe(200);

    const reuse = await resetPOST(
      jsonRequest("/api/auth/reset-password", { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    );
    expect(reuse.status).toBe(400);

    expect((await loginViaApi(student.email, TEST_PASSWORD)).status).toBe(401);
    expect((await loginViaApi(student.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("rejects an invalid or expired reset token with 400", async () => {
    const res = await resetPOST(
      jsonRequest("/api/auth/reset-password", { token: "0".repeat(48), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    );
    expect(res.status).toBe(400);
    expect(String((await jsonOf(res)).error)).toMatch(/invalid or expired/i);
  });
});

describe("04W Role Dashboard Router", () => {
  it("routes unauthenticated API sessions to login", async () => {
    const res = await meGET(new Request(`${BASE}/api/auth/me`, { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("routes STUDENT to /student", () => {
    expect(roleDashboardPath("STUDENT")).toBe("/student");
  });

  it("routes ADMIN and SUPERADMIN to their dashboards", () => {
    expect(roleDashboardPath("ADMIN")).toBe("/admin");
    expect(roleDashboardPath("SUPERADMIN")).toBe("/superadmin");
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
    expect(await jsonOf(put)).toMatchObject({ user: { email: student.email, phone: "+639170000000" } });
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

    sessionCookie = "";
    expect((await loginViaApi(student.email, TEST_PASSWORD)).status).toBe(401);
    expect((await loginViaApi(student.email, NEW_PASSWORD)).status).toBe(200);
  });
});

describe("Dev outbox removal", () => {
  it("does not expose an anonymous outbox endpoint", async () => {
    const res = await fetch(`${BASE}/api/dev/outbox?limit=10`, { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("lists queued emails with categories, including verification, reset and lockout alerts", async () => {
    await registerPOST(jsonRequest("/api/auth/register", registerBody()));
    const student = await createVerifiedStudent("outbox");
    await forgotPOST(jsonRequest("/api/auth/forgot-password", { email: student.email }));
    for (let i = 0; i < 5; i++) await loginViaApi(student.email, "BadPass");

    const emails = await prisma.emailOutbox.findMany({ orderBy: { createdAt: "desc" } });
    const mine = emails.filter((e) => e.toEmail.includes(RUN));
    const categories = new Set(mine.map((e) => e.category));
    expect(categories.has("VERIFICATION")).toBe(true);
    expect(categories.has("PASSWORD_RESET")).toBe(true);
    expect(categories.has("SECURITY_ALERT")).toBe(true);
  });
});
