import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 1000;

function redirectResult(request: Request, verified: "1" | "invalid"): NextResponse {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  return NextResponse.redirect(`${configured}/login?verified=${verified}`, { status: 302 });
}

async function consumeToken(rawToken: string) {
  const user = await db.user.findFirst({ where: { verificationToken: hashToken(rawToken) } });
  if (!user) return null;
  const sentAt = user.verificationSentAt?.getTime() ?? 0;
  if (Date.now() - sentAt > VERIFICATION_TOKEN_TTL_MS) return null;
  if (user.status !== "PENDING_VERIFICATION") return null;
  return user;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return redirectResult(request, "invalid");

  const user = await consumeToken(token);
  if (!user) return redirectResult(request, "invalid");

  await db.user.update({
    where: { id: user.id },
    data: { status: "ACTIVE", verificationToken: null },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "AUTH_EMAIL_VERIFIED",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email },
  });

  return redirectResult(request, "1");
}

export async function POST(request: Request) {
  let payload: { token?: unknown };
  try {
    payload = (await request.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof payload.token !== "string" || payload.token.trim().length < 10) {
    return NextResponse.json(
      { error: "Invalid or expired verification token." },
      { status: 400 }
    );
  }

  const user = await consumeToken(payload.token.trim());
  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired verification token." },
      { status: 400 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { status: "ACTIVE", verificationToken: null },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "AUTH_EMAIL_VERIFIED",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email },
  });

  return NextResponse.json({
    message: "Email verified. Your account is now active — you can sign in.",
    user: { id: user.id, email: user.email, status: "ACTIVE" },
  });
}
