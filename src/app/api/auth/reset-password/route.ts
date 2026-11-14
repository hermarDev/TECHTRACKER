import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const resetSchema = z
  .object({
    token: z.string().trim().min(16, "Invalid or expired reset token"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid reset details" },
      { status: 400 }
    );
  }

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Invalid or expired reset token. Request a new password reset link." },
      { status: 400 }
    );
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(parsed.data.password),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await writeAuditLog({
    actorId: record.userId,
    action: "AUTH_PASSWORD_RESET",
    entityType: "User",
    entityId: record.userId,
    details: { email: record.user.email, via: "RESET_TOKEN" },
  });

  return NextResponse.json({
    message: "Password updated successfully. You can now sign in with your new password.",
  });
}
