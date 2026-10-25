import { getTranslations } from "next-intl/server";
import { apiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { toFactoryDateTimeInput } from "@/lib/time";
import { auditWhere, changeLines } from "@/lib/audit-query";
import { toCsv } from "@/lib/reports/format";

/** CSV of the audit log with the same filters as the page (max 20,000 rows). */
export async function GET(req: Request) {
  const me = await apiUser();
  if (me instanceof Response) return me;
  if (!me.permissions.has("audit:export")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const t = await getTranslations();
  const rows = await db.auditLog.findMany({ where: auditWhere(sp), orderBy: { createdAt: "desc" }, take: 20_000, include: { user: { select: { fullName: true, employeeId: true } } } });
  const csv = toCsv(
    [t("admin.when"), t("admin.who"), t("admin.employeeId"), t("admin.what"), t("admin.record"), "ID", t("audit.reason"), t("audit.changes")],
    rows.map((r) => [
      toFactoryDateTimeInput(r.createdAt).replace("T", " "), r.user?.fullName ?? t("audit.system"), r.user?.employeeId ?? "",
      r.action, r.entityType, r.entityId ?? "", r.reason ?? "", changeLines(r.before, r.after, 30).join(" | "),
    ]),
  );
  await audit({ userId: me.id, action: "audit.export", entityType: "AuditLog", after: { ...sp, rows: rows.length } });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bereket-audit-log.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
