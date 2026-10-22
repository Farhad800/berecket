import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentShift, factoryDay, formatDate } from "@/lib/time";
import { getJobTotals } from "@/lib/production";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import DailySheet, { type SheetRow } from "./daily-sheet";

export const metadata = { title: "Daily production entry" };

/** One screen to enter the shift's quantities for every running or due job. */
export default async function DailyEntryPage() {
  const me = await pageUser("production:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { start, end } = factoryDay();

  const jobs = await db.productionJob.findMany({
    where: {
      OR: [{ status: { in: ["IN_PROGRESS", "PAUSED"] } }, { status: "PLANNED", plannedStart: { lt: end } }],
      orderLine: { order: { status: { notIn: ["CANCELLED", "DRAFT"] } } },
    },
    orderBy: [{ machine: { code: "asc" } }, { plannedStart: "asc" }],
    take: 1000,
    include: {
      machine: { select: { code: true, status: true } },
      orderLine: { include: { product: { select: { code: true, name: true } }, order: { select: { number: true, customer: { select: { name: true } } } } } },
      batches: { where: { closedAt: null }, select: { number: true }, take: 1 },
    },
  });
  const [totals, today] = await Promise.all([
    getJobTotals(jobs.map((j) => j.id)),
    db.productionEntry.groupBy({ by: ["jobId"], where: { jobId: { in: jobs.map((j) => j.id) }, reportedAt: { gte: start, lt: end } }, _sum: { qtyGood: true } }),
  ]);
  const todayBy = new Map(today.map((x) => [x.jobId, x._sum.qtyGood ?? 0]));

  const rows: SheetRow[] = jobs.map((j) => ({
    id: j.id,
    job: j.number,
    status: j.status,
    machine: j.machine?.code ?? "—",
    machineDown: ["DOWN", "MAINTENANCE"].includes(j.machine?.status ?? ""),
    product: `${j.orderLine.product.code} · ${j.orderLine.product.name}`,
    order: `${j.orderLine.order.number} · ${j.orderLine.order.customer.name}`,
    planned: j.plannedQty,
    produced: totals.get(j.id)?.good ?? 0,
    today: todayBy.get(j.id) ?? 0,
    batch: j.batches[0]?.number ?? null,
  }));

  return (
    <>
      <Link href="/production" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.production")}
      </Link>
      <PageHeader title={t("daily.title")} subtitle={t("daily.subtitle", { date: formatDate(new Date(), locale), n: rows.length })} />
      {!can(me, "production:create") && <div className="mb-4"><Alert tone="blue">{t("common.readOnly")}</Alert></div>}
      {rows.length === 0 ? (
        <EmptyState>{t("daily.none")}</EmptyState>
      ) : (
        <DailySheet rows={rows} shift={currentShift()} canEnter={can(me, "production:create")} canStart={can(me, "production:edit")} />
      )}
    </>
  );
}
