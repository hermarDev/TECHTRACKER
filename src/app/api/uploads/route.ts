import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/rbac";
import { saveUploadedObject, validateUploadFile } from "@/lib/storage";

export async function POST(req: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const file = formData.get("file");
  const rawCategory = String(formData.get("category") ?? "messages");
  const category =
    rawCategory === "inspections" || rawCategory === "messages"
      ? rawCategory
      : "messages";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  const check = validateUploadFile(file);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const saved = await saveUploadedObject(category, file);
  return NextResponse.json({ file: saved }, { status: 201 });
}
