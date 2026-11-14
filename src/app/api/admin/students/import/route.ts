import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { parse } from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

type ImportRow = {
  email?: string;
  studentIdNo?: string;
  fullName?: string;
  program?: string;
  section?: string;
  password?: string;
};

function normalizeRow(row: any): ImportRow {
  const get = (key: string) => {
    const val = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    return val == null ? undefined : String(val).trim();
  };
  return {
    email: get("email"),
    studentIdNo: get("studentIdNo") ?? get("student_id"),
    fullName: get("fullName") ?? get("name"),
    program: get("program"),
    section: get("section"),
    password: get("password"),
  };
}

export async function POST(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const resolution = (formData.get("duplicateResolution") as string) || "skip"; // skip | overwrite | flag
  const batchId = (formData.get("batchId") as string) || null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "File exceeds maximum allowed size of 5 MB" }, { status: 400 });
  }
  const mime = file.type || "";
  const isCsv = mime === "text/csv" || file.name.toLowerCase().endsWith(".csv");
  const isXlsx =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.name.toLowerCase().endsWith(".xlsx");
  if (!isCsv && !isXlsx) {
    return NextResponse.json({ error: "Unsupported file type. Upload CSV or XLSX." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: ImportRow[] = [];

  if (isCsv) {
    const text = buffer.toString("utf-8");
    const result = parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    rows = result.data.map(normalizeRow);
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { blankrows: false });
    rows = raw.map(normalizeRow);
  }

  rows = rows.filter((r) => r.email || r.studentIdNo || r.fullName);

  const created: ImportRow[] = [];
  const skipped: ImportRow[] = [];
  const overwritten: ImportRow[] = [];
  const flagged: ImportRow[] = [];
  const errors: { row: ImportRow; error: string }[] = [];

  for (const row of rows) {
    if (!row.email || !row.studentIdNo || !row.fullName) {
      errors.push({ row, error: "email, studentIdNo and fullName are required" });
      continue;
    }
    const existingByEmail = await db.user.findUnique({ where: { email: row.email.toLowerCase() } });
    const existingById = row.studentIdNo ? await db.user.findUnique({ where: { studentIdNo: row.studentIdNo } }) : null;

    const existing = existingByEmail || existingById;
    if (existing) {
      if (resolution === "skip") {
        skipped.push(row);
        continue;
      }
      if (resolution === "flag") {
        flagged.push(row);
        continue;
      }
      // overwrite
      await db.user.update({
        where: { id: existing.id },
        data: {
          fullName: row.fullName,
          program: row.program ?? null,
          section: row.section ?? null,
          ...(batchId ? { batchId } : {}),
        },
      });
      overwritten.push(row);
      continue;
    }

    const pw = row.password;
    await db.user.create({
      data: {
        email: row.email.toLowerCase(),
        passwordHash: pw
          ? await (async () => {
              const { hashPassword } = await import("@/lib/auth");
              return hashPassword(pw);
            })()
          : "",
        fullName: row.fullName,
        role: "STUDENT",
        status: "PENDING_VERIFICATION",
        studentIdNo: row.studentIdNo,
        program: row.program ?? null,
        section: row.section ?? null,
        batchId: batchId ?? null,
      },
    });
    created.push(row);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "STUDENTS_IMPORTED",
    entityType: "User",
    entityId: "bulk",
    details: { fileName: file.name, resolution, created: created.length, skipped: skipped.length, overwritten: overwritten.length, flagged: flagged.length, errors: errors.length },
  });

  return NextResponse.json({
    created,
    skipped,
    overwritten,
    flagged,
    errors,
    summary: { created: created.length, skipped: skipped.length, overwritten: overwritten.length, flagged: flagged.length, errors: errors.length },
  }, { status: 200 });
}
