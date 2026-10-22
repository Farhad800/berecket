import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/time";
import { getBatchBalances } from "@/lib/stock";
import { ISSUE_TONE, QC_TONE, SEVERITY_TONE } from "@/lib/tones";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import Attachments from "@/components/attachments";
import InspectionForm from "./inspection-form";

export default async function BatchQcPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("qc:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const b = await db.batch.findUnique({
    where: { id },
    include: {
      product: true,
      orderLine: { include: { order: { include: { customer: true } } } },
      job: { include: { machine: true, mold: true } },
      inspections: { orderBy: { inspectedAt: "desc" } },
      issues: { orderBy: { createdAt: "desc" }, include: { category: true } },
    },
  });
  if (!b) notFound();
  const [sums, users, categories, files, balances] = await Promise.all([
    db.productionEntry.aggregate({ where: { batchId: id }, _sum: { qtyGood: true, qtyDefective: true } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
    db.defectCategory.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.attachment.findMany({ where: { entityType: "QcInspection", entityId: { in: b.inspections.map((i) => i.id) } }, orderBy: { createdAt: "asc" } }),
    getBatchBalances([id]),
  ]);
  const produced = sums._sum.qtyGood ?? 0;
  const bal = balances.get(id)!;
  const onHand = bal.AVAILABLE + bal.RESERVED + bal.QUARANTINE + bal.REJECTED;
  const name = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const n = (v: number) => formatNumber(v, locale);
  const decisionTone = { APPROVE: "green", PARTIAL: "amber", HOLD: "red", REJECT: "red" } as const;

  return (
    <>
      <PageHeader title={b.number} subtitle={<>{b.product.name} · <Link href={`/orders/${b.orderLine.order.id}`} className="hover:underline" dir="ltr">{b.orderLine.order.number}</Link> · {b.orderLine.order.customer.name}</>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={QC_TONE[b.qcStatus]} className="text-sm">{t(`status.qc.${b.qcStatus}`)}</Badge>
              {b.product.qcRequired && <Badge tone="amber">{t("md.qcRequiredShort")}</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <F label={t("prod.good")} v={n(produced)} />
              <F label={t("prod.defective")} v={n(sums._sum.qtyDefective ?? 0)} />
              <F label={t("sched.machine")} v={b.job.machine?.code ?? "—"} />
              <F label={t("sched.mold")} v={b.job.mold?.code ?? "—"} />
              <F label={t("sched.shift")} v={b.shift} />
              <F label={t("sched.job")} v={<Link href={`/production/${b.job.id}`} className="text-brand-600 hover:underline" dir="ltr">{b.job.number}</Link>} />
              <F label={t("order.created")} v={formatDateTime(b.createdAt, locale)} />
            </dl>
            {b.orderLine.specifications && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap"><b>{t("md.specifications")}:</b> {b.orderLine.specifications}</p>}
            {onHand > 0 && (
              <div className="mt-3">
                <Alert tone={bal.QUARANTINE + bal.REJECTED > 0 ? "amber" : "blue"}>
                  {t("qc.inWarehouse", { available: n(bal.AVAILABLE + bal.RESERVED), quarantine: n(bal.QUARANTINE), rejected: n(bal.REJECTED) })}
                </Alert>
              </div>
            )}
          </Card>

          <Card className="p-0 sm:p-0">
            <h2 className="p-4 pb-2 font-semibold">{t("qc.tab.inspections")}</h2>
            {b.inspections.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">{t("qc.noInspections")}</p> : (
              <ul className="divide-y divide-line">
                {b.inspections.map((i) => (
                  <li key={i.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="ltr">{i.number}</span>
                      <Badge tone={decisionTone[i.decision]}>{t(`qc.dec.${i.decision}`)}</Badge>
                      <span className="text-xs text-muted">{i.sampleOnly ? t("qc.sample") : t("qc.full")}</span>
                    </div>
                    <p className="tabular-nums">{t("qc.counts", { inspected: n(i.qtyInspected), accepted: n(i.qtyAccepted), rejected: n(i.qtyRejected), hold: n(i.qtyHold) })}</p>
                    {i.notes && <p className="text-muted">{i.notes}</p>}
                    <p className="text-xs text-muted">{name(i.inspectorId)} · {formatDateTime(i.inspectedAt, locale)}</p>
                    <Attachments
                      entityType="QcInspection" entityId={i.id} canAdd={can(me, "qc:create")}
                      files={files.filter((f) => f.entityId === i.id).map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, when: formatDateTime(f.createdAt, locale), by: name(f.uploadedById) }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {b.issues.length > 0 && (
            <Card className="p-0 sm:p-0">
              <h2 className="p-4 pb-2 font-semibold">{t("qc.tab.issues")}</h2>
              <ul className="divide-y divide-line">
                {b.issues.map((i) => (
                  <li key={i.id}>
                    <Link href={`/qc/issues/${i.id}`} className="block px-4 py-3 hover:bg-surface-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" dir="ltr">{i.number}</span>
                        <Badge tone={SEVERITY_TONE[i.severity]}>{t(`status.severity.${i.severity}`)}</Badge>
                        <Badge tone={ISSUE_TONE[i.status]}>{t(`status.issue.${i.status}`)}</Badge>
                        <span className="text-sm">{i.category.name}</span>
                      </div>
                      <p className="mt-1 text-sm">{i.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          {can(me, "qc:create") ? (
            <InspectionForm batchId={b.id} produced={produced} canApprove={can(me, "qc:approve")} categories={categories} openIssue={b.issues.find((x) => x.status !== "RESOLVED")?.number ?? null} />
          ) : (
            <Alert tone="blue">{t("common.readOnly")}</Alert>
          )}
        </div>
      </div>
    </>
  );
}

function F({ label, v }: { label: string; v: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{v}</dd></div>;
}
