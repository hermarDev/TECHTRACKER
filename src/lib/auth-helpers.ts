import bcrypt from "bcryptjs";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function isResetTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
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
