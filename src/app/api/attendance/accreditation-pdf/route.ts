import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, canAccessStudentRecord } from "@/lib/rbac";
import { generateAccreditationPdf } from "@/lib/pdf-accreditation";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["STUDENT", "ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const studentId = request.nextUrl.searchParams.get("studentId") ?? auth.user.id;
  const student = await db.user.findUnique({ where: { id: studentId }, select: { id: true, fullName: true, studentIdNo: true, program: true, section: true, requiredHours: true, preOjtCompleted: true, role: true, batch: { select: { coordinatorId: true } } } });
  if (!student || student.role !== "STUDENT" || !canAccessStudentRecord(auth.user, student.id, student.batch?.coordinatorId)) return NextResponse.json({ error: "Student record not found." }, { status: 404 });
  if (!student.preOjtCompleted) return NextResponse.json({ error: "Accreditation is available only for completed students." }, { status: 409 });
  const logs = await db.attendanceLog.findMany({ where: { studentId, status: "APPROVED" }, orderBy: { shiftDate: "asc" }, select: { shiftDate: true, timeIn: true, timeOut: true, creditedHours: true, isIrregular: true } });
  const pdf = generateAccreditationPdf(student, logs);
  return new NextResponse(pdf as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="accreditation-${student.studentIdNo ?? student.id}.pdf"` } });
}
