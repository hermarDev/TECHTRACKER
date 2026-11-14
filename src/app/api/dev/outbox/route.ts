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
  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const take = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 50;

  const emails = await db.emailOutbox.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ emails, total: emails.length });
}
