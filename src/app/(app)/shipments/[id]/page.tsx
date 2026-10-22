import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/time";
import { getBatchBalances } from "@/lib/stock";
import { QC_TONE, SHIP_TONE } from "@/lib/tones";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import Attachments from "@/components/attachments";
import ShipmentActions from "./shipment-actions";

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("shipments:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const s = await db.shipment.findUnique({
    where: { id },
    include: { customer: true, order: true, lines: { include: { orderLine: { include: { product: true } }, batch: true } } },
  });
  if (!s) notFound();
  const [users, files, bal] = await Promise.all([
    db.user.findMany({ select: { id: true, fullName: true } }),
    db.attachment.findMany({ where: { entityType: "Shipment", entityId: id }, orderBy: { createdAt: "asc" } }),
    getBatchBalances(s.lines.map((l) => l.batchId)),
  ]);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const n = (v: number) => formatNumber(v, locale);
  // Warn on drafts whose batches QC has blocked since they were reserved.
  const problems = s.status === "DRAFT" ? s.lines.filter((l) => !["RELEASED", "APPROVED", "PARTIAL"].includes(l.batch.qcStatus) || bal.get(l.batchId)!.RESERVED < l.qty) : [];
  const total = s.lines.reduce((a, l) => a + l.qty, 0);

  return (
    <>
      <PageHeader title={s.number} subtitle={<>{s.customer.name} · <Link href={`/orders/${s.orderId}`} className="hover:underline" dir="ltr">{s.order.number}</Link></>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {problems.length > 0 && <Alert>{t("ship.problems", { batches: problems.map((p) => p.batch.number).join(", ") })}</Alert>}
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={SHIP_TONE[s.status]}>{t(`status.ship.${s.status}`)}</Badge>
              {s.deliveryNote && <span className="text-sm" dir="ltr">{t("ship.deliveryNote")}: <b>{s.deliveryNote}</b></span>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <F label={t("ship.plannedDate")} v={formatDate(s.plannedDate, locale)} />
              <F label={t("ship.shippedAt")} v={formatDateTime(s.shippedAt, locale)} />
              <F label={t("ship.vehicle")} v={s.vehicle ?? "—"} />
              <F label={t("ship.driver")} v={s.driver ?? "—"} />
              <F label={t("order.created")} v={`${name(s.createdById)} · ${formatDateTime(s.createdAt, locale)}`} />
              {s.confirmedById && <F label={t("ship.confirmedBy")} v={name(s.confirmedById)} />}
            </dl>
            {s.notes && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{s.notes}</p>}
          </Card>
          <Card className="p-0 sm:p-0">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr><th className="px-4 py-2 text-start">{t("md.product")}</th><th className="px-2 py-2 text-start">{t("prod.batch")}</th><th className="px-4 py-2 text-end">{t("order.quantity")}</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2">{l.orderLine.lineNo}. {l.orderLine.product.name} <span className="text-xs text-muted" dir="ltr">{l.orderLine.product.code}</span></td>
                      <td className="px-2 py-2"><Link href={`/qc/batches/${l.batchId}`} className="text-brand-600 hover:underline" dir="ltr">{l.batch.number}</Link> <Badge tone={QC_TONE[l.batch.qcStatus]}>{t(`status.qc.${l.batch.qcStatus}`)}</Badge></td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums">{n(l.qty)}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-2 font-semibold"><td className="px-4 py-2" colSpan={2}>{t("ship.total")}</td><td className="px-4 py-2 text-end tabular-nums">{n(total)}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("files.title")}</h2>
            <Attachments entityType="Shipment" entityId={s.id} canAdd={can(me, "shipments:create") || can(me, "shipments:edit")}
              files={files.map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, when: formatDateTime(f.createdAt, locale), by: name(f.uploadedById) }))} />
          </Card>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <ShipmentActions id={s.id} status={s.status} canConfirm={can(me, "shipments:approve")} canCancel={can(me, "shipments:edit")} />
        </div>
      </div>
    </>
  );
}

function F({ label, v }: { label: string; v: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{v}</dd></div>;
}
