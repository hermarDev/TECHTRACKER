import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/rbac";

export async function GET(request: Request) {
  void request;
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { user } = auth;
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      batchId: user.batchId,
    },
  });
}
