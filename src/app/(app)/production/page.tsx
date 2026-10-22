import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertOctagon, Clock } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { factoryDay, formatDateTime, formatNumber, currentShift } from "@/lib/time";
import { getJobTotals } from "@/lib/production";
import { JOB_TONE } from "@/lib/tones";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { StackedProgress } from "@/components/progress";
import ListToolbar from "@/components/list-toolbar";

export const metadata = { title: "Production" };

const TABS = ["now", "planned", "done"] as const;

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ tab?: string; machine?: string; q?: string; status?: string }> }) {
  await pageUser("production:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : sp.status === "IN_PROGRESS" ? "now" : "now";
  const { start, end } = factoryDay();
  const q = sp.q?.trim();

  const base: Prisma.ProductionJobWhereInput = {
    ...(sp.machine ? { machineId: sp.machine } : {}),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { orderLine: { order: { number: { contains: q, mode: "insensitive" } } } },
      { orderLine: { product: { code: { contains: q, mode: "insensitive" } } } },
      { batches: { some: { number: { contains: q, mode: "insensitive" } } } },
    ] } : {}),
  };
  const where: Prisma.ProductionJobWhereInput =
    tab === "now"
      ? { ...base, OR: [{ status: { in: ["IN_PROGRESS", "PAUSED"] } }, { status: "PLANNED", plannedStart: { lt: end } }] }
      : tab === "planned"
        ? { ...base, status: "PLANNED" }
        : { ...base, status: "COMPLETED", actualEnd: { gte: new Date(Date.now() - 30 * 86_400_000) } };

  const [jobs, machines, todayByShift, todayByMachine] = await Promise.all([
    db.productionJob.findMany({
      where,
      orderBy: tab === "done" ? { actualEnd: "desc" } : [{ status: "asc" }, { plannedStart: "asc" }],
      take: 100,
      include: {
        machine: { select: { code: true, status: true } },
        mold: { select: { code: true } },
        orderLine: { include: { order: { select: { number: true, customer: { select: { name: true } } } }, product: { select: { code: true, name: true } } } },
        downtimes: { where: { endedAt: null }, select: { category: true } },
      },
    }),
    db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true } }),
    db.productionEntry.groupBy({ by: ["shift"], where: { reportedAt: { gte: start, lt: end } }, _sum: { qtyGood: true, qtyDefective: true } }),
    db.$queryRaw<{ code: string; good: bigint; bad: bigint }[]>`
      SELECT m.code, COALESCE(SUM(e."qtyGood"),0) AS good, COALESCE(SUM(e."qtyDefective"),0) AS bad
      FROM "ProductionEntry" e JOIN "ProductionJob" j ON j.id = e."jobId" JOIN "Machine" m ON m.id = j."machineId"
      WHERE e."reportedAt" >= ${start} AND e."reportedAt" < ${end}
      GROUP BY m.code ORDER BY m.code`,
  ]);
  const totals = await getJobTotals(jobs.map((j) => j.id));
  const shiftNow = currentShift();
  const n = (v: number) => formatNumber(v, locale);
  const dayGood = todayByShift.reduce((s, r) => s + (r._sum.qtyGood ?? 0), 0);
  const dayBad = todayByShift.reduce((s, r) => s + (r._sum.qtyDefective ?? 0), 0);

  return (
    <>
      <PageHeader title={t("nav.production")} subtitle={t("prod.shiftNow", { shift: shiftNow })} />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Card>
          <p className="text-xs text-muted">{t("dashboard.producedToday")}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{n(dayGood)}</p>
          <p className="text-xs text-muted">{t("prod.defective")}: {n(dayBad)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {(["A", "B", "C"] as const).map((s) => {
              const r = todayByShift.find((x) => x.shift === s);
              return (
                <div key={s} className={cn("rounded-lg bg-surface-2 p-2", s === shiftNow && "ring-2 ring-brand-400")}>
                  <p className="text-muted">{t("sched.shift")} {s}</p>
                  <p className="font-bold tabular-nums">{n(r?._sum.qtyGood ?? 0)}</p>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <p className="mb-2 text-xs text-muted">{t("prod.todayByMachine")}</p>
          {todayByMachine.length === 0 ? (
            <p className="text-sm text-muted">{t("common.empty")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {todayByMachine.map((m) => (
                <li key={m.code} className="rounded-lg bg-surface-2 p-2 text-sm">
                  <p className="font-semibold" dir="ltr">{m.code}</p>
                  <p className="tabular-nums">{n(Number(m.good))} <span className="text-xs text-muted">/ {n(Number(m.bad))} ✕</span></p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/production?tab=${k}${sp.machine ? `&machine=${sp.machine}` : ""}`}
            role="tab"
            aria-selected={tab === k}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted")}
          >
            {t(`prod.tab.${k}`)}
          </Link>
        ))}
      </div>
      <ListToolbar
        placeholder={t("prod.searchPlaceholder")}
        filters={[{ name: "machine", label: t("sched.machine"), options: machines.map((m) => ({ value: m.id, label: m.code })) }]}
      />

      {jobs.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => {
            const tot = totals.get(j.id)!;
            const late = j.status === "PLANNED" && j.plannedStart < new Date();
            return (
              <Link key={j.id} href={`/production/${j.id}`} className={cn("rounded-2xl border bg-surface p-4 transition hover:border-brand-300 hover:shadow-sm", j.status === "PAUSED" ? "border-amber-300 dark:border-amber-800" : "border-line")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold" dir="ltr">{j.machine?.code ?? "—"}{j.mold && <span className="ms-2 text-sm font-normal text-muted">{j.mold.code}</span>}</p>
                    <p className="truncate font-semibold">{j.orderLine.product.name}</p>
                    <p className="truncate text-xs text-muted"><span dir="ltr">{j.number} · {j.orderLine.order.number}</span> · {j.orderLine.order.customer.name}</p>
                  </div>
                  <Badge tone={JOB_TONE[j.status]}>{t(`status.job.${j.status}`)}</Badge>
                </div>
                <p className="mt-3 text-sm tabular-nums"><b className="text-lg">{n(tot.good)}</b> / {n(j.plannedQty)} {t("md.pcs")}</p>
                <StackedProgress className="mt-1" quantity={j.plannedQty} produced={tot.good} />
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span className={cn("inline-flex items-center gap-1", late && "font-semibold text-amber-700")}><Clock className="size-3" />{formatDateTime(j.actualStart ?? j.plannedStart, locale)}</span>
                  {j.downtimes.length > 0 && <span className="inline-flex items-center gap-1 font-semibold text-red-600"><AlertOctagon className="size-3" />{t(`prod.cat.${j.downtimes[0].category}`)}</span>}
                  {tot.defective > 0 && <span>{t("prod.defective")}: {n(tot.defective)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
