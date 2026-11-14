import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Local zero-subscription email outbox (replaces SMTP in the prototype).
 * Public read access is intentional: newly self-registered students and
 * users recovering passwords must read their verification / reset links
 * before they can sign in. This endpoint is dev-tooling only and must be
 * disabled or secured before any real deployment.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_OUTBOX !== "1") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const take = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 50;

  const emails = await db.emailOutbox.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ emails, total: emails.length });
}
