import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { RESET_TOKEN_TTL_MS, createOpaqueToken } from "@/lib/auth";
import { queueEmailOutbox } from "@/lib/audit";

const forgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").toLowerCase(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = forgotSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid email address" },
      { status: 400 }
    );
  }

  const genericMessage =
    "If an account exists for this email address, a password reset link has been sent. The link expires in 1 hour.";

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    // Do not reveal whether the account exists (anti-enumeration).
    return NextResponse.json({ message: genericMessage });
  }

  // Invalidate any previous unused reset tokens.
  await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const { raw, hash } = createOpaqueToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt },
  });

  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  const resetUrl = `${configured}/reset-password?token=${raw}`;

  await queueEmailOutbox({
    toEmail: user.email,
    subject: "TechTracker — Reset Your Password",
    category: "PASSWORD_RESET",
    body: [
      `Hello ${user.fullName},`,
      "",
      "A password reset was requested for your TechTracker account.",
      "Open this single-use link to choose a new password (valid for 1 hour):",
      resetUrl,
      "",
      "If you did not request this, you can safely ignore this email — your current password remains active.",
    ].join("\n"),
  });

  return NextResponse.json({ message: genericMessage });
}
