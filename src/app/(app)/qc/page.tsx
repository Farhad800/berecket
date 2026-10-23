import Link from "next/link";
import type { EntryQcStatus, IssueStatus, Prisma, Severity } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertOctagon, Shuffle } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/time";
import { ENTRY_QC_TONE, ISSUE_TONE, SEVERITY_TONE } from "@/lib/tones";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import CategoryManager from "./category-manager";

export const metadata = { title: "Quality Control" };
const TABS = ["inspect", "inspections", "issues", "categories"] as const;

export default async function QcPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; severity?: string; q?: string }>;
}) {
  const me = await pageUser("qc:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  // Dashboard deep-links: ?status=PENDING → inspect tab, ?severity=CRITICAL → issues tab
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as (typeof TABS)[number])
    : sp.severity ? "issues" : "inspect";
  const q = sp.q?.trim();
  const n = (v: number) => formatNumber(v, locale);

  const [criticalOpen, pendingCount] = await Promise.all([
    db.qualityIssue.count({ where: { severity: "CRITICAL", status: { not: "RESOLVED" } } }),
    db.productionEntry.count({ where: { qcStatus: "NOT_INSPECTED", product: { qcRequired: true } } }),
  ]);
  const tabs = (
    <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {TABS.filter((k) => k !== "categories" || can(me, "qc:approve")).map((k) => (
        <Link key={k} href={`/qc?tab=${k}`} role="tab" aria-selected={tab === k}
          className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted")}>
          {t(`qc.tab.${k}`)}
          {k === "inspect" && pendingCount > 0 && <Badge tone="amber" className="ms-2">{pendingCount}</Badge>}
          {k === "issues" && criticalOpen > 0 && <Badge tone="red" className="ms-2">{criticalOpen}</Badge>}
        </Link>
      ))}
    </div>
  );
  const header = (
    <>
      <PageHeader title={t("nav.qc")} subtitle={t("qc.policy")} />
      {criticalOpen > 0 && (
        <Link href="/qc?tab=issues&severity=CRITICAL" className="mb-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertOctagon className="size-4" /> {t("qc.criticalBanner", { n: criticalOpen })}
        </Link>
      )}
      {tabs}
    </>
  );

  const entrySearch: Prisma.ProductionEntryWhereInput = q ? { product: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {};

  if (tab === "inspect") {
    const statuses: EntryQcStatus[] = ["NOT_INSPECTED", "APPROVED", "REJECTED"];
    const status = statuses.includes(sp.status as EntryQcStatus) ? (sp.status as EntryQcStatus) : undefined;
    const since = new Date(Date.now() - 14 * 86_400_000);
    const entries = await db.productionEntry.findMany({
      where: { ...entrySearch, ...(status ? { qcStatus: status } : { day: { gte: since } }) },
      orderBy: [{ day: "desc" }, { shift: "desc" }],
      take: 300,
      include: { product: { select: { code: true, name: true, qcRequired: true } } },
    });
    // Products marked "inspection required" that QC hasn't checked yet come first.
    entries.sort((a, b) => Number(b.product.qcRequired && b.qcStatus === "NOT_INSPECTED") - Number(a.product.qcRequired && a.qcStatus === "NOT_INSPECTED"));
    // Random sampling suggestion: one not-yet-inspected entry from the last 7 days.
    const week = Date.now() - 7 * 86_400_000;
    const uninspected = entries.filter((e) => e.qcStatus === "NOT_INSPECTED" && e.day.getTime() >= week);
    const pick = uninspected.length ? uninspected[Math.floor(Math.random() * uninspected.length)] : null;

    return (
      <>
        {header}
        <ListToolbar placeholder={t("qc.searchEntries")} filters={[{ name: "status", label: t("qc.last14"), options: statuses.map((s) => ({ value: s, label: t(`status.entryQc.${s}`) })) }]} />
        {pick && can(me, "qc:create") && (
          <Link href={`/qc/entries/${pick.id}`} className="mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-800 dark:bg-brand-900">
            <Shuffle className="size-5 text-brand-600" />
            <span>{t("qc.randomPick")} <b>{pick.product.name}</b> · {formatDate(pick.day, locale)} · {t("rep.col.shift")} {pick.shift}</span>
          </Link>
        )}
        {entries.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id}>
                  <Link href={`/qc/entries/${e.id}`} className="grid gap-1 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{e.product.name}</span>
                        <span className="text-xs text-muted" dir="ltr">{e.product.code}</span>
                        <Badge tone={ENTRY_QC_TONE[e.qcStatus]}>{t(`status.entryQc.${e.qcStatus}`)}</Badge>
                        {e.product.qcRequired && e.qcStatus === "NOT_INSPECTED" && <Badge tone="amber">{t("md.qcRequiredShort")}</Badge>}
                      </div>
                      <p className="text-xs text-muted">{formatDate(e.day, locale)} · {t("rep.col.shift")} {e.shift}</p>
                    </div>
                    <p className="font-semibold tabular-nums sm:text-end">{n(e.quantity)} {t("md.pcs")}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (tab === "inspections") {
    const inspections = await db.qcInspection.findMany({
      where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { entry: entrySearch }] } : {},
      orderBy: { inspectedAt: "desc" },
      take: 150,
      include: { entry: { select: { id: true, day: true, shift: true, product: { select: { code: true } } } } },
    });
    const users = await db.user.findMany({ select: { id: true, fullName: true } });
    const decisionTone = { APPROVE: "green", REJECT: "red" } as const;
    return (
      <>
        {header}
        <ListToolbar placeholder={t("qc.searchEntries")} />
        {inspections.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-start">{t("qc.inspection")}</th>
                    <th className="px-2 py-2 text-start">{t("order.product")}</th>
                    <th className="px-2 py-2 text-start">{t("qc.decision")}</th>
                    <th className="px-2 py-2 text-end">{t("qc.inspected")}</th>
                    <th className="px-2 py-2 text-end">{t("qc.rejectedShort")}</th>
                    <th className="px-4 py-2 text-start">{t("qc.inspector")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {inspections.map((i) => (
                    <tr key={i.id} className="hover:bg-surface-2">
                      <td className="px-4 py-2"><span dir="ltr">{i.number}</span><div className="text-xs text-muted">{formatDateTime(i.inspectedAt, locale)}</div></td>
                      <td className="px-2 py-2"><Link href={`/qc/entries/${i.entry.id}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{i.entry.product.code}</Link><div className="text-xs text-muted">{formatDate(i.entry.day, locale)} · {i.entry.shift}</div></td>
                      <td className="px-2 py-2"><Badge tone={decisionTone[i.decision]}>{t(`qc.dec.${i.decision}`)}</Badge>{i.sampleOnly && <span className="ms-1 text-xs text-muted">{t("qc.sample")}</span>}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{n(i.qtyInspected)}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{n(i.qtyRejected)}</td>
                      <td className="px-4 py-2">{users.find((u) => u.id === i.inspectorId)?.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </>
    );
  }

  if (tab === "issues") {
    const statuses: IssueStatus[] = ["OPEN", "IN_PROGRESS", "AWAITING_VERIFICATION", "RESOLVED", "REOPENED"];
    const status = statuses.includes(sp.status as IssueStatus) ? (sp.status as IssueStatus) : undefined;
    const severity = ["MINOR", "MAJOR", "CRITICAL"].includes(sp.severity ?? "") ? (sp.severity as Severity) : undefined;
    const issues = await db.qualityIssue.findMany({
      where: {
        ...(status ? { status } : { status: { not: "RESOLVED" } }),
        ...(severity ? { severity } : {}),
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { entry: entrySearch }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { category: true, entry: { select: { day: true, shift: true, product: { select: { code: true } } } }, _count: { select: { actions: true } } },
    });
    const sevRank = { CRITICAL: 0, MAJOR: 1, MINOR: 2 } as const;
    issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
    return (
      <>
        {header}
        <ListToolbar
          placeholder={t("qc.searchIssues")}
          filters={[
            { name: "status", label: t("qc.unresolved"), options: statuses.map((s) => ({ value: s, label: t(`status.issue.${s}`) })) },
            { name: "severity", label: t("qc.severity"), options: ["CRITICAL", "MAJOR", "MINOR"].map((s) => ({ value: s, label: t(`status.severity.${s}`) })) },
          ]}
        />
        {issues.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {issues.map((i) => (
                <li key={i.id}>
                  <Link href={`/qc/issues/${i.id}`} className={cn("block px-4 py-3 hover:bg-surface-2", i.severity === "CRITICAL" && i.status !== "RESOLVED" && "border-s-4 border-red-500")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="ltr">{i.number}</span>
                      <Badge tone={SEVERITY_TONE[i.severity]}>{t(`status.severity.${i.severity}`)}</Badge>
                      <Badge tone={ISSUE_TONE[i.status]}>{t(`status.issue.${i.status}`)}</Badge>
                      <span className="text-sm">{i.category.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{i.description}</p>
                    <p className="text-xs text-muted"><span dir="ltr">{i.entry.product.code}</span> · {formatDate(i.entry.day, locale)} · {t(`qc.dept.${i.responsibleDept}`)} · {t("qc.actionsCount", { n: i._count.actions })} · {formatDateTime(i.createdAt, locale)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  const categories = await db.defectCategory.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { issues: true } } } });
  return (
    <>
      {header}
      <CategoryManager categories={categories.map((c) => ({ id: c.id, code: c.code, name: c.name, active: c.active, uses: c._count.issues }))} />
    </>
  );
}
