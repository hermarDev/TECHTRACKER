import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const batchUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  section: z.string().min(1).optional(),
  academicYear: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const params = await context.params;
  const batch = await db.batch.findUnique({ where: { id: params.id } });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (user.role === "ADMIN" && batch.coordinatorId !== user.id) {
    return NextResponse.json({ error: "Forbidden: not the batch coordinator" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = batchUpdateSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await db.batch.update({ where: { id: params.id }, data: parse.data });

  await writeAuditLog({
    actorId: user.id,
    action: "BATCH_UPDATED",
    entityType: "Batch",
    entityId: params.id,
    details: parse.data,
  });

  return NextResponse.json({ batch: updated }, { status: 200 });
}
