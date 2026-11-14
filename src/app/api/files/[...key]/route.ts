import fs from "fs/promises";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/rbac";
import { mimeFromStorageKey, resolveSafeStoragePath } from "@/lib/storage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const { key } = await context.params;
    const joined = key.join("/");
    const filePath = resolveSafeStoragePath(joined);
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": mimeFromStorageKey(joined),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
