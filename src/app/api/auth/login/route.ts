import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  evaluateLockoutState,
  nextFailureState,
  signSessionJwt,
  verifyPassword,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { queueEmailOutbox, writeAuditLog } from "@/lib/audit";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sign-in details" },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const lockState = evaluateLockoutState(user.failedLoginCount, user.lockedUntil);
  if (lockState.isLocked) {
    return NextResponse.json(
      {
        error: `Account is locked due to too many failed sign-in attempts. Try again in ${lockState.remainingMinutes} minute(s).`,
        remainingMinutes: lockState.remainingMinutes,
      },
      { status: 423 }
    );
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const failure = nextFailureState(user.failedLoginCount);
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failure.failedLoginCount, lockedUntil: failure.lockedUntil },
    });

    if (failure.triggeredLock) {
      await queueEmailOutbox({
        toEmail: user.email,
        subject: "TechTracker Security Alert — Account Locked",
        category: "SECURITY_ALERT",
        body: [
          `Security alert for ${user.fullName} (${user.email}).`,
          "",
          "Five consecutive failed sign-in attempts were recorded for your TechTracker account.",
          "The account is locked for 15 minutes as a protective measure.",
          "If this was not you, reset your password from the sign-in screen and contact your Pre-OJT coordinator.",
        ].join("\n"),
      });

      await writeAuditLog({
        actorId: user.id,
        action: "AUTH_LOCKOUT_TRIGGERED",
        entityType: "User",
        entityId: user.id,
        details: { email: user.email, failedLoginCount: failure.failedLoginCount },
      });

      return NextResponse.json(
        {
          error:
            "Account is locked due to 5 consecutive failed sign-in attempts. A security alert has been logged. Try again in 15 minutes.",
          remainingMinutes: 15,
        },
        { status: 423 }
      );
    }

    return NextResponse.json(
      {
        error: `Invalid email or password. ${failure.remainingAttempts} attempt(s) remaining before a 15-minute lockout.`,
        remainingAttempts: failure.remainingAttempts,
      },
      { status: 401 }
    );
  }

  if (user.status === "PENDING_VERIFICATION") {
    return NextResponse.json(
      { error: "Verify your email address first. Check your inbox (or the local dev outbox at /dev/outbox) for the verification link." },
      { status: 403 }
    );
  }
  if (user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "This account is suspended or deactivated. Contact your Pre-OJT coordinator." },
      { status: 403 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const token = await signSessionJwt({
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    batchId: user.batchId,
  });

  await writeAuditLog({
    actorId: user.id,
    action: "AUTH_LOGIN",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email, role: user.role },
  });

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      batchId: user.batchId,
    },
    message: "Signed in successfully.",
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
