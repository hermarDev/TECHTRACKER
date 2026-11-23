import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { queueEmailOutbox, writeAuditLog } from "@/lib/audit";


function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? "Invalid registration details" },
      { status: 400 }
    );
  }

  const { email, password, fullName, studentIdNo, program, section } = parsed.data;

  const config = await db.systemConfig.findUnique({ where: { id: "singleton" } });
  if (config && !config.allowSelfRegistration) {
    return NextResponse.json(
      { error: "Student self-registration is currently disabled. Contact your Pre-OJT coordinator." },
      { status: 403 }
    );
  }

  const emailTaken = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (emailTaken) {
    return NextResponse.json(
      { error: "An account with this email address already exists." },
      { status: 409 }
    );
  }

  const studentIdTaken = await db.user.findUnique({ where: { studentIdNo }, select: { id: true } });
  if (studentIdTaken) {
    return NextResponse.json(
      { error: "This student ID number is already registered." },
      { status: 409 }
    );
  }

  const verification = createOpaqueToken();
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName,
      role: "STUDENT",
      status: "PENDING_VERIFICATION",
      studentIdNo,
      program,
      section,
      verificationToken: verification.hash,
      verificationSentAt: new Date(),
    },
    select: { id: true, email: true, fullName: true, role: true, status: true },
  });

  const verifyUrl = `${appOrigin(request)}/api/auth/verify?token=${verification.raw}`;
  await queueEmailOutbox({
    toEmail: user.email,
    subject: "TechTracker — Verify Your Student Account",
    category: "VERIFICATION",
    body: [
      `Hello ${user.fullName},`,
      "",
      "Your TechTracker student self-registration was received for ACLC College of Mandaue.",
      "Confirm your email address to activate your 100-hour Pre-OJT account:",
      verifyUrl,
      "",
      `This verification link expires in 24 hours. Registration reference: ${studentIdNo} (${program}, ${section}).`,
      "If you did not request this account, ignore this message.",
    ].join("\n"),
  });

  await writeAuditLog({
    actorId: user.id,
    action: "AUTH_REGISTER",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email, studentIdNo },
  });

  return NextResponse.json(
    {
      user,
      message: "Registration received. Check your email for the verification link.",
    },
    { status: 201 }
  );
}
