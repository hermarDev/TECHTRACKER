import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const CREDIT_ROUNDING_RULES = ["EXACT_MINUTES", "ROUND_DOWN_15", "ROUND_UP_15", "NEAREST_QUARTER"] as const;

const configPatchSchema = z.object({
  requiredPreOjtHours: z.number().positive("Required Pre-OJT hours must be positive").max(1000).optional(),
  taskCategories: z
    .array(z.string().trim().min(1, "Category name is required").max(60))
    .min(1, "At least one task category is required")
    .max(20)
    .optional(),
  creditRoundingRule: z.enum(CREDIT_ROUNDING_RULES).optional(),
  allowSelfRegistration: z.boolean().optional(),
});

async function readSingleton() {
  return db.systemConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {},
  });
}

export async function GET() {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;

  const config = await readSingleton();

  return NextResponse.json({
    config: {
      requiredPreOjtHours: config.requiredPreOjtHours,
      taskCategories: config.taskCategories,
      creditRoundingRule: config.creditRoundingRule,
      allowSelfRegistration: config.allowSelfRegistration,
      updatedAt: config.updatedAt,
    },
  });
}

export async function PATCH(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = configPatchSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const changes = parse.data;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No config fields to update were provided" }, { status: 400 });
  }

  const previous = await readSingleton();

  const updated = await db.systemConfig.update({
    where: { id: "singleton" },
    data: {
      ...(changes.requiredPreOjtHours !== undefined ? { requiredPreOjtHours: changes.requiredPreOjtHours } : {}),
      ...(changes.taskCategories !== undefined ? { taskCategories: changes.taskCategories } : {}),
      ...(changes.creditRoundingRule !== undefined ? { creditRoundingRule: changes.creditRoundingRule } : {}),
      ...(changes.allowSelfRegistration !== undefined
        ? { allowSelfRegistration: changes.allowSelfRegistration }
        : {}),
    },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "SYSTEM_CONFIG_UPDATED",
    entityType: "SystemConfig",
    entityId: "singleton",
    details: {
      changes,
      previous: {
        requiredPreOjtHours: previous.requiredPreOjtHours,
        taskCategories: previous.taskCategories,
        creditRoundingRule: previous.creditRoundingRule,
        allowSelfRegistration: previous.allowSelfRegistration,
      },
    },
  });

  return NextResponse.json({
    config: {
      requiredPreOjtHours: updated.requiredPreOjtHours,
      taskCategories: updated.taskCategories,
      creditRoundingRule: updated.creditRoundingRule,
      allowSelfRegistration: updated.allowSelfRegistration,
      updatedAt: updated.updatedAt,
    },
  });
}
