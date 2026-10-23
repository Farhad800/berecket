import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export const AUDIT_DAYS = ["1", "7", "30", "90", "365"] as const;

/** Where each kind of audited record can be opened. */
export const ENTITY_HREF: Record<string, (id: string) => string> = {
  Order: (id) => `/orders/${id}`,
  ProductionEntry: (id) => `/qc/entries/${id}`,
  QcInspection: () => `/qc?tab=inspections`,
  QualityIssue: (id) => `/qc/issues/${id}`,
  MaintenanceRequest: (id) => `/service/requests/${id}`,
  ServiceReport: (id) => `/service/reports/${id}`,
  Report: (id) => `/reports/${id}`,
};

export type AuditFilter = { q?: string; user?: string; entity?: string; days?: string };

export function auditWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const q = f.q?.trim().slice(0, 80);
  const days = (AUDIT_DAYS as readonly string[]).includes(f.days ?? "") ? Number(f.days) : null;
  return {
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { reason: { contains: q, mode: "insensitive" } }, { entityId: q }] } : {}),
    ...(f.user && /^[a-z0-9]{10,40}$/i.test(f.user) ? { userId: f.user } : {}),
    ...(f.entity && /^[A-Za-z]{2,40}$/.test(f.entity) ? { entityType: f.entity } : {}),
    ...(days ? { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {}),
  };
}

export async function auditFilterOptions() {
  const [users, entities] = await Promise.all([
    db.user.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
  ]);
  return { users, entities: entities.map((e) => e.entityType) };
}

/** "field: old → new" lines from the stored before/after snapshots. */
export function changeLines(before: unknown, after: unknown, max = 8): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const show = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
  };
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.slice(0, max).map((k) => (k in b && k in a ? `${k}: ${show(b[k])} → ${show(a[k])}` : k in a ? `${k}: ${show(a[k])}` : `${k}: ${show(b[k])} → —`));
}
