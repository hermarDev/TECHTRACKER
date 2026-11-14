import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { generateOperationalReportCsv, generateOperationalReportPdf } from "@/lib/reports-export";

const reportSchema = z.object({
  type: z.enum(["attendance", "duty-hours", "task-progress", "lab-equipment"]).optional(),
  batchId: z.string().optional(),
  section: z.string().optional(),
  program: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  format: z.enum(["json", "csv", "pdf"]).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export async function GET(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const parse = reportSchema.safeParse(query);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { type, batchId, section, program, status, dateFrom, dateTo, format, page, pageSize } = parse.data;

  const where: any = {};
  if (batchId) where.batchId = batchId;
  if (section) where.section = section;
  if (program) where.program = program;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.shiftDate = {};
    if (dateFrom) where.shiftDate.gte = new Date(dateFrom);
    if (dateTo) where.shiftDate.lte = new Date(dateTo);
  }
  if (user.role === "ADMIN") {
    where.batch = { coordinatorId: user.id };
  }

  const { page: p, pageSize: ps, skip, take } = normalizePagination(page, pageSize);

  let rows: any[] = [];
  let total = 0;

  if (type === "attendance" || type === "duty-hours") {
    const [logs, cnt] = await db.$transaction([
      db.attendanceLog.findMany({ where, orderBy: { shiftDate: "desc" }, skip, take, include: { student: { select: { id: true, fullName: true, studentIdNo: true, email: true } }, batch: { select: { id: true, name: true, section: true } } } }),
      db.attendanceLog.count({ where }),
    ]);
    rows = logs.map((l) => ({
      batch: l.batch.name,
      section: l.batch.section,
      metric: "Attendance",
      value: String(l.recordedHours),
      label: `${l.student.fullName} (${l.student.studentIdNo}) - ${l.status}`,
    }));
    total = cnt;
  } else if (type === "task-progress") {
    const [assignments, cnt] = await db.$transaction([
      db.taskAssignment.findMany({ where: { task: { batchId } }, orderBy: { createdAt: "desc" }, skip, take, include: { student: { select: { id: true, fullName: true, studentIdNo: true } }, task: { select: { id: true, title: true, batchId: true } } } }),
      db.taskAssignment.count({ where: { task: { batchId } } }),
    ]);
    rows = assignments.map((a) => ({
      batch: a.task.batchId ?? "",
      section: "",
      metric: "Task Progress",
      value: a.status,
      label: `${a.student.fullName} - ${a.task.title}`,
    }));
    total = cnt;
  } else if (type === "lab-equipment") {
    const [rooms, cnt] = await db.$transaction([
      db.labRoom.findMany({ orderBy: { name: "asc" }, skip, take, include: { units: true } }),
      db.labRoom.count({ where }),
    ]);
    rows = rooms.flatMap((r) =>
      r.units.map((u) => ({
        batch: "",
        section: "",
        metric: "Lab Equipment",
        value: u.condition,
        label: `${r.name} - ${u.unitCode}`,
      })),
    );
    total = cnt;
  } else {
    // default: attendance summary
    const [logs, cnt] = await db.$transaction([
      db.attendanceLog.findMany({ where, orderBy: { shiftDate: "desc" }, skip, take }),
      db.attendanceLog.count({ where }),
    ]);
    rows = logs.map((l) => ({ batch: "", section: "", metric: "Attendance", value: String(l.recordedHours), label: l.status }));
    total = cnt;
  }

  await writeAuditLog({
    actorId: user.id,
    action: "REPORTS_VIEWED",
    entityType: "Report",
    entityId: type ?? "all",
    details: { type, filters: { batchId, section, program, status, dateFrom, dateTo } },
  });

  const pageMeta = { page: p, pageSize: ps, total, totalPages: Math.ceil(total / ps) };

  if (format === "csv") {
    const csv = generateOperationalReportCsv(rows);
    return new Response(csv, {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="operational-report-${type ?? "all"}.csv"` },
    });
  }
  if (format === "pdf") {
    const pdf = generateOperationalReportPdf(rows);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="operational-report-${type ?? "all"}.pdf"` },
    });
  }

  return NextResponse.json({ data: rows, ...pageMeta });
}
