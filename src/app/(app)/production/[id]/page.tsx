import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarRange } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentShift, formatDateTime, formatNumber } from "@/lib/time";
import { DOWNTIME_CATEGORIES, getJobTotals } from "@/lib/production";
import { Badge, Card, LinkButton, PageHeader, cn } from "@/components/ui";
import { JOB_TONE, QC_TONE } from "@/lib/tones";
import { StackedProgress } from "@/components/progress";
import JobConsole from "./job-console";


export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("production:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  const job = await db.productionJob.findUnique({
    where: { id },
    include: {
      orderLine: { include: { order: { include: { customer: true } }, product: true } },
      machine: true,
      mold: true,
      batches: { orderBy: { createdAt: "asc" } },
      entries: { orderBy: { reportedAt: "desc" }, take: 200, include: { batch: { select: { number: true } } } },
      downtimes: { orderBy: { startedAt: "desc" }, include: { maintenanceRequest: { select: { id: true, number: true, status: true } } } },
    },
  });
  if (!job) notFound();

  const [totals, users] = await Promise.all([getJobTotals([id]), db.user.findMany({ select: { id: true, fullName: true } })]);
  const tot = totals.get(id)!;
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const batchQty = new Map<string, { good: number; bad: number }>();
  for (const e of await db.productionEntry.groupBy({ by: ["batchId"], where: { jobId: id }, _sum: { qtyGood: true, qtyDefective: true } })) {
    batchQty.set(e.batchId, { good: e._sum.qtyGood ?? 0, bad: e._sum.qtyDefective ?? 0 });
  }
  const openBatch = job.batches.find((b) => !b.closedAt) ?? null;
  const n = (v: number) => formatNumber(v, locale);
  const scrap = tot.good + tot.defective > 0 ? Math.round((tot.defective / (tot.good + tot.defective)) * 1000) / 10 : 0;
  const order = job.orderLine.order;

  return (
    <>
      <PageHeader
        title={job.number}
        subtitle={
          <>
            <Link href={`/orders/${order.id}`} className="font-semibold hover:underline" dir="ltr">{order.number}</Link> · {order.customer.name}
          </>
        }
        actions={can(me, "schedule:view") && <LinkButton variant="secondary" href={`/schedule?job=${job.id}&date=${job.plannedStart.toISOString().slice(0, 10)}`}><CalendarRange className="size-4" /> {t("nav.schedule")}</LinkButton>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={JOB_TONE[job.status]}>{t(`status.job.${job.status}`)}</Badge>
              {job.priority !== "NORMAL" && <Badge tone={job.priority === "URGENT" ? "red" : job.priority === "HIGH" ? "amber" : "gray"}>{t(`status.priority.${job.priority}`)}</Badge>}
            </div>
            <p className="text-lg font-semibold">{job.orderLine.product.name} <span className="text-sm font-normal text-muted" dir="ltr">{job.orderLine.product.code}</span></p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{t("prod.ofPlanned", { done: n(tot.good), total: n(job.plannedQty) })}</p>
            <StackedProgress className="mt-2 h-3" quantity={job.plannedQty} produced={tot.good} />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label={t("sched.machine")} value={job.machine ? `${job.machine.code}` : "—"} ltr />
              <Fact label={t("sched.mold")} value={job.mold ? `${job.mold.code} (${job.mold.cavities}×)` : "—"} ltr />
              <Fact label={t("prod.defective")} value={`${n(tot.defective)} · ${scrap}%`} warn={scrap > 3} />
              <Fact label={t("prod.downtime")} value={t("prod.minutes", { n: n(tot.downtimeMin) })} warn={tot.downtimeMin > 0} />
              <Fact label={t("prod.plannedWindow")} value={`${formatDateTime(job.plannedStart, locale)} → ${formatDateTime(job.plannedEnd, locale)}`} wide />
              <Fact label={t("prod.actualWindow")} value={`${formatDateTime(job.actualStart, locale)} → ${job.actualEnd ? formatDateTime(job.actualEnd, locale) : "…"}`} wide />
            </dl>
            {job.orderLine.specifications && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{job.orderLine.specifications}</p>}
            {order.instructions && <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap"><b>{t("order.instructions")}:</b> {order.instructions}</p>}
          </Card>

          <Card className="p-0 sm:p-0">
            <h2 className="p-4 pb-2 font-semibold">{t("prod.batches")}</h2>
            {job.batches.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">{t("prod.noBatches")}</p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-xs text-muted">
                    <tr><th className="px-4 py-2 text-start">{t("prod.batch")}</th><th className="px-2 py-2 text-start">{t("sched.shift")}</th><th className="px-2 py-2 text-end">{t("prod.good")}</th><th className="px-2 py-2 text-end">{t("prod.defective")}</th><th className="px-4 py-2 text-start">{t("prod.qc")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {job.batches.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-2 font-semibold" dir="ltr">{b.number}{!b.closedAt && <Badge tone="purple" className="ms-2">{t("prod.open")}</Badge>}</td>
                        <td className="px-2 py-2">{b.shift}</td>
                        <td className="px-2 py-2 text-end tabular-nums">{n(batchQty.get(b.id)?.good ?? 0)}</td>
                        <td className="px-2 py-2 text-end tabular-nums">{n(batchQty.get(b.id)?.bad ?? 0)}</td>
                        <td className="px-4 py-2"><Badge tone={QC_TONE[b.qcStatus]}>{t(`status.qc.${b.qcStatus}`)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-0 sm:p-0">
            <h2 className="p-4 pb-2 font-semibold">{t("prod.log")}</h2>
            {job.entries.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">{t("common.empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {job.entries.map((e) => (
                  <li key={e.id} className={cn("flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm", e.isCorrection && "bg-amber-50 dark:bg-amber-950/40")}>
                    <span>
                      <b className="tabular-nums">{e.qtyGood > 0 && !e.isCorrection ? "+" : ""}{n(e.qtyGood)}</b> {t("prod.good").toLowerCase()}
                      {e.qtyDefective !== 0 && <span className="text-amber-700 dark:text-amber-300"> · {n(e.qtyDefective)} {t("prod.defective").toLowerCase()}</span>}
                      {e.isCorrection && <Badge tone="amber" className="ms-2">{t("prod.correction")}</Badge>}
                      {e.notes && <span className="block text-xs text-muted">{e.notes}</span>}
                    </span>
                    <span className="text-xs text-muted" dir="ltr">{e.batch.number} · {e.shift} · {name(e.reportedById)} · {formatDateTime(e.reportedAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {job.downtimes.length > 0 && (
            <Card className="p-0 sm:p-0">
              <h2 className="p-4 pb-2 font-semibold">{t("prod.downtime")}</h2>
              <ul className="divide-y divide-line">
                {job.downtimes.map((d) => {
                  const mins = Math.round(((d.endedAt?.getTime() ?? Date.now()) - d.startedAt.getTime()) / 60000);
                  return (
                    <li key={d.id} className="px-4 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={d.endedAt ? "gray" : "red"}>{t(`prod.cat.${d.category}`)}</Badge>
                        <b className="tabular-nums">{t("prod.minutes", { n: n(mins) })}</b>
                        {!d.endedAt && <Badge tone="red">{t("prod.ongoing")}</Badge>}
                        {d.maintenanceRequest && (
                          <Link href={`/service?request=${d.maintenanceRequest.id}`} className="text-xs font-semibold text-brand-600 hover:underline" dir="ltr">{d.maintenanceRequest.number}</Link>
                        )}
                      </div>
                      <p className="mt-1">{d.reason}</p>
                      <p className="text-xs text-muted">{formatDateTime(d.startedAt, locale)} → {d.endedAt ? formatDateTime(d.endedAt, locale) : "…"} · {name(d.reportedById)}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <JobConsole
            jobId={job.id}
            status={job.status}
            shift={currentShift()}
            openBatch={openBatch?.number ?? null}
            batches={job.batches.map((b) => ({ id: b.id, number: b.number }))}
            categories={DOWNTIME_CATEGORIES}
            can={{
              start: can(me, "production:edit"),
              report: can(me, "production:create"),
              edit: can(me, "production:edit"),
              maintenance: can(me, "maintenance:create"),
            }}
          />
        </div>
      </div>
    </>
  );
}

function Fact({ label, value, warn, ltr, wide }: { label: string; value: string; warn?: boolean; ltr?: boolean; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("font-medium", warn && "text-amber-600")} dir={ltr ? "ltr" : undefined}>{value}</dd>
    </div>
  );
}
