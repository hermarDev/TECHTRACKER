import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { generateInspectionSummaryCsv, generateInspectionSummaryPdf } from "@/lib/reports-export";
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const params = await context.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();

  const inspection = await db.inspection.findUnique({
    where: { id: params.id },
    include: {
      room: true,
      inspector: { select: { id: true, fullName: true } },
      items: { include: { unit: true }, orderBy: { id: "asc" } },
    },
  });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  const rows = inspection.items.map((i) => ({
    room: inspection.room.name,
    unitCode: i.unit.unitCode,
    condition: i.condition,
    remarks: i.remarks ?? "",
    photoKey: i.photoKey,
    inspectedAt: inspection.createdAt.toISOString(),
    inspector: inspection.inspector.fullName,
  }));

  await writeAuditLog({
    actorId: user.id,
    action: "INSPECTION_EXPORTED",
    entityType: "Inspection",
    entityId: params.id,
    details: { format, itemCount: rows.length },
  });

  if (format === "pdf") {
    const pdf = generateInspectionSummaryPdf(rows);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="room-condition-summary-${params.id}.pdf"`,
      },
    });
  }

  const csv = generateInspectionSummaryCsv(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="room-condition-summary-${params.id}.csv"`,
    },
  });
}
