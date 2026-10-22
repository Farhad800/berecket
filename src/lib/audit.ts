import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export async function audit(
  entry: {
    userId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  },
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      reason: entry.reason ?? null,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Returns only the fields that changed, for compact before/after audit records. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const bv = before[key];
    const av = after[key];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(bv)) !== JSON.stringify(norm(av))) {
      b[key] = norm(bv);
      a[key] = norm(av);
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
