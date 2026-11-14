import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "techtracker_session";
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface SessionPayload {
  sub: string;
  email: string;
  fullName: string;
  role: Role;
  batchId: string | null;
}

function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set with >= 16 chars in production");
    }
    return new TextEncoder().encode("techtracker-local-dev-secret-change-me");
  }
  return new TextEncoder().encode(raw);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSessionJwt(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
    batchId: payload.batchId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getJwtSecret());
}

export async function verifySessionJwt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (!payload.sub || !payload.role || !payload.email) return null;
    return {
      sub: payload.sub,
      email: String(payload.email),
      fullName: String(payload.fullName ?? ""),
      role: payload.role as Role,
      batchId: payload.batchId ? String(payload.batchId) : null,
    };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionJwt(token);
}

export function createOpaqueToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function evaluateLockoutState(
  failedLoginCount: number,
  lockedUntil: Date | null,
  now: Date = new Date()
): { isLocked: boolean; remainingMinutes: number } {
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    const remainingMinutes = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
    return { isLocked: true, remainingMinutes };
  }
  return { isLocked: false, remainingMinutes: 0 };
}

export function nextFailureState(
  currentFailCount: number,
  now: Date = new Date()
): {
  failedLoginCount: number;
  lockedUntil: Date | null;
  triggeredLock: boolean;
  remainingAttempts: number;
} {
  const nextCount = currentFailCount + 1;
  if (nextCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return {
      failedLoginCount: nextCount,
      lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS),
      triggeredLock: true,
      remainingAttempts: 0,
    };
  }
  return {
    failedLoginCount: nextCount,
    lockedUntil: null,
    triggeredLock: false,
    remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS - nextCount,
  };
}
