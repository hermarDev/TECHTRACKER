import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/rbac";

export async function GET(request: Request) {
  void request;
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { user } = auth;
  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: { preOjtCompleted: true },
  });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      batchId: user.batchId,
      preOjtCompleted: profile?.preOjtCompleted ?? false,
    },
  });
}
