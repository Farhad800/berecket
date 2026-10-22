import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FileSpreadsheet } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/time";
import { AUDIT_DAYS, ENTITY_HREF, auditFilterOptions, auditWhere, changeLines, type AuditFilter } from "@/lib/audit-query";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";

export const metadata = { title: "Audit log" };
const SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilter & { page?: string }> }) {
  const me = await pageUser("audit:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(sp);
  const [rows, total, opts] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * SIZE, take: SIZE, include: { user: { select: { fullName: true } } } }),
    db.auditLog.count({ where }),
    auditFilterOptions(),
  ]);
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "page" && typeof v === "string" && v) as [string, string][]);
  const pageHref = (p: number) => `/audit?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) })}`;
  const actionLabel = (a: string) => (t.has(`history.${a}`) ? t(`history.${a}`) : a);

  return (
    <>
      <PageHeader
        title={t("admin.audit")}
        subtitle={t("audit.intro")}
        actions={can(me, "audit:export") && (
          <a href={`/api/audit?${qs}`} download className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
            <FileSpreadsheet className="size-4" /> {t("rep.csv")}
          </a>
        )}
      />
      <ListToolbar
        placeholder={t("audit.search")}
        filters={[
          { name: "days", label: t("audit.anyTime"), options: AUDIT_DAYS.map((d) => ({ value: d, label: t("audit.lastDays", { n: Number(d) }) })) },
          { name: "user", label: t("audit.anyone"), options: opts.users.map((u) => ({ value: u.id, label: u.fullName })) },
          { name: "entity", label: t("audit.anyRecord"), options: opts.entities.map((e) => ({ value: e, label: t.has(`audit.entity.${e}`) ? t(`audit.entity.${e}`) : e })) },
        ]}
      />
      {rows.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const href = r.entityId && ENTITY_HREF[r.entityType]?.(r.entityId);
              const lines = changeLines(r.before, r.after);
              return (
                <li key={r.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr]">
                  <div className="text-xs text-muted">
                    <p>{formatDateTime(r.createdAt, locale)}</p>
                    <p className="font-semibold text-ink">{r.user?.fullName ?? t("audit.system")}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.action.startsWith("auth.") ? "gray" : r.action.includes("delete") || r.action.includes("cancel") ? "red" : "blue"}>{actionLabel(r.action)}</Badge>
                      <span className="text-xs text-muted">{t.has(`audit.entity.${r.entityType}`) ? t(`audit.entity.${r.entityType}`) : r.entityType}</span>
                      {href && <Link href={href} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">{t("audit.open")}</Link>}
                    </div>
                    {r.reason && <p className="mt-1"><span className="text-muted">{t("audit.reason")}:</span> {r.reason}</p>}
                    {lines.length > 0 && (
                      <ul className="mt-1 space-y-0.5 font-mono text-[11px] break-words text-muted" dir="ltr">
                        {lines.map((l) => <li key={l}>{l}</li>)}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">{t("audit.count", { n: formatNumber(total, locale) })}</span>
            <div className="flex items-center gap-3">
              {page > 1 && <Link className="font-semibold text-brand-600" href={pageHref(page - 1)} aria-label="previous"><span className="rtl:hidden">←</span><span className="ltr:hidden">→</span></Link>}
              <span>{page} / {pages}</span>
              {page < pages && <Link className="font-semibold text-brand-600" href={pageHref(page + 1)} aria-label="next"><span className="rtl:hidden">→</span><span className="ltr:hidden">←</span></Link>}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
