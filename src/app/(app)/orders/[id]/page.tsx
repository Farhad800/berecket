import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarRange, Pencil } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_HREF } from "@/lib/audit-query";
import { factoryDay, formatDate, formatDateTime, formatNumber } from "@/lib/time";
import { getLineProgress, OPEN_STATUSES, PRIORITY_TONE, STATUS_TONE } from "@/lib/orders";
import { Alert, Badge, Card, LinkButton, PageHeader, cn } from "@/components/ui";
import { StackedProgress } from "@/components/progress";
import Comments from "@/components/comments";
import OrderActions from "./order-actions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("orders:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          product: true,
          jobs: { orderBy: { plannedStart: "asc" }, include: { machine: { select: { code: true } }, mold: { select: { code: true } } } },
        },
      },
      shipments: { orderBy: { createdAt: "asc" }, include: { lines: true } },
    },
  });
  if (!order) notFound();

  const jobIds = order.lines.flatMap((l) => l.jobs.map((j) => j.id));
  const lineIds = order.lines.map((l) => l.id);
  // Everything that happened to this order across departments: planning, production,
  // maintenance interruptions, quality decisions, receipts and shipments.
  const [batches, requests, serviceReports, receipts] = await Promise.all([
    db.batch.findMany({ where: { orderLineId: { in: lineIds } }, select: { id: true, inspections: { select: { id: true } }, issues: { select: { id: true } } } }),
    db.maintenanceRequest.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } }),
    db.serviceReport.findMany({ where: { orderId: id }, select: { id: true } }),
    db.warehouseReceipt.findMany({ where: { orderLineId: { in: lineIds } }, select: { id: true } }),
  ]);
  const related: [string, string[]][] = [
    ["Order", [id]],
    ["ProductionJob", jobIds],
    ["Batch", batches.map((b) => b.id)],
    ["QcInspection", batches.flatMap((b) => b.inspections.map((i) => i.id))],
    ["QualityIssue", batches.flatMap((b) => b.issues.map((i) => i.id))],
    ["MaintenanceRequest", requests.map((r) => r.id)],
    ["ServiceReport", serviceReports.map((r) => r.id)],
    ["WarehouseReceipt", receipts.map((r) => r.id)],
    ["Shipment", order.shipments.map((s) => s.id)],
  ];
  const [progress, history, comments, users] = await Promise.all([
    getLineProgress([id]),
    db.auditLog.findMany({
      where: { OR: related.filter(([, ids]) => ids.length).map(([entityType, ids]) => ({ entityType, entityId: { in: ids } })) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { fullName: true } } },
    }),
    db.comment.findMany({ where: { entityType: "Order", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  const userName = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const { start } = factoryDay();
  const overdue = OPEN_STATUSES.includes(order.status) && order.requestedDeliveryDate < start;

  // Which manual actions this person may take right now.
  const allowed: ("confirm" | "hold" | "resume" | "cancel" | "close")[] = [];
  if (order.status === "DRAFT" && can(me, "orders:approve")) allowed.push("confirm");
  if (OPEN_STATUSES.includes(order.status) && order.status !== "ON_HOLD" && can(me, "orders:edit")) allowed.push("hold");
  if (order.status === "ON_HOLD" && can(me, "orders:edit")) allowed.push("resume");
  if (!["DELIVERED", "CANCELLED"].includes(order.status) && can(me, "orders:edit")) allowed.push("cancel");
  const anyMade = [...progress.values()].some((p) => p.produced > 0 || p.shipped > 0);
  if (OPEN_STATUSES.includes(order.status) && anyMade && can(me, "orders:approve")) allowed.push("close");
  const editable = !["DELIVERED", "CANCELLED"].includes(order.status) && can(me, "orders:edit");
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <PageHeader
        title={order.number}
        subtitle={<Link href={`/customers?q=${encodeURIComponent(order.customer.code)}`} className="hover:underline">{order.customer.name}</Link>}
        actions={
          <>
            {can(me, "schedule:create") && OPEN_STATUSES.includes(order.status) && order.status !== "ON_HOLD" && (
              <LinkButton variant="secondary" href={`/schedule?order=${order.id}`}><CalendarRange className="size-4" /> {t("order.planProduction")}</LinkButton>
            )}
            {editable && <LinkButton variant="secondary" href={`/orders/${order.id}/edit`}><Pencil className="size-4" /> {t("common.edit")}</LinkButton>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[order.status]}>{t(`status.order.${order.status}`)}</Badge>
              <Badge tone={PRIORITY_TONE[order.priority]}>{t(`status.priority.${order.priority}`)}</Badge>
              {overdue && <Badge tone="red">{t("dashboard.overdue")}</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <Fact label={t("order.requestedDelivery")} value={formatDate(order.requestedDeliveryDate, locale)} danger={overdue} />
              <Fact label={t("order.plannedStart")} value={formatDate(order.plannedStart, locale)} />
              <Fact label={t("order.plannedEnd")} value={formatDate(order.plannedEnd, locale)} />
              <Fact label={t("order.customerReference")} value={order.customerReference ?? "—"} />
              <Fact label={t("order.created")} value={`${formatDate(order.createdAt, locale)} · ${userName(order.createdById)}`} />
              {order.confirmedAt && <Fact label={t("order.confirmed")} value={formatDate(order.confirmedAt, locale)} />}
              {order.deliveredAt && <Fact label={t("status.order.DELIVERED")} value={formatDate(order.deliveredAt, locale)} />}
            </dl>
            {order.deliveryException && <div className="mt-3"><Alert tone="amber"><b>{t("order.exception")}:</b> {order.deliveryException}</Alert></div>}
            <div className="mt-4"><OrderActions orderId={order.id} allowed={allowed} /></div>
          </Card>

          <Card className="p-0 sm:p-0">
            <h2 className="p-4 pb-2 font-semibold">{t("order.products")}</h2>
            <ul className="divide-y divide-line">
              {order.lines.map((l) => {
                const p = progress.get(l.id)!;
                return (
                  <li key={l.id} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{l.lineNo}. {l.product.name}</p>
                        <p className="text-xs text-muted" dir="ltr">{l.product.code}</p>
                      </div>
                      <p className="text-lg font-bold tabular-nums">{t("order.ofPieces", { done: n(Math.min(p.released, p.quantity)), total: n(p.quantity) })}</p>
                    </div>
                    {l.specifications && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{l.specifications}</p>}
                    <StackedProgress className="mt-3" quantity={p.quantity} planned={p.planned} produced={p.released} shipped={p.shipped} />
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5 lg:grid-cols-10">
                      <Num label={t("order.q.planned")} v={n(p.planned)} />
                      <Num label={t("order.q.produced")} v={n(p.produced)} />
                      <Num label={t("order.q.defective")} v={n(p.defective)} warn={p.defective > 0} />
                      <Num label={t("order.q.pendingQc")} v={n(p.pendingQc)} />
                      <Num label={t("order.q.blocked")} v={n(p.blocked)} warn={p.blocked > 0} />
                      <Num label={t("order.q.released")} v={n(p.released)} />
                      <Num label={t("order.q.received")} v={n(p.received)} />
                      <Num label={t("order.q.shipped")} v={n(p.shipped)} />
                      <Num label={t("order.q.toProduce")} v={n(p.remainingToProduce)} strong />
                      <Num label={t("order.q.toDeliver")} v={n(p.remainingToDeliver)} strong />
                    </dl>
                    {l.jobs.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                        {l.jobs.map((j) => (
                          <li key={j.id} className="flex flex-wrap items-center gap-2">
                            <Link href={`/production/${j.id}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{j.number}</Link>
                            <Badge tone={j.status === "CANCELLED" ? "gray" : j.status === "COMPLETED" ? "green" : j.status === "IN_PROGRESS" ? "purple" : "blue"}>{t(`status.job.${j.status}`)}</Badge>
                            <span dir="ltr">{j.machine?.code ?? "—"}{j.mold ? ` / ${j.mold.code}` : ""}</span>
                            <span className="text-muted">{formatDateTime(j.plannedStart, locale)} → {formatDateTime(j.plannedEnd, locale)}</span>
                            <span className="tabular-nums">{n(j.plannedQty)} {t("md.pcs")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {(order.instructions || order.packaging || order.notes) && (
            <Card>
              <dl className="space-y-3 text-sm">
                {order.instructions && <Block label={t("order.instructions")} value={order.instructions} />}
                {order.packaging && <Block label={t("order.packaging")} value={order.packaging} />}
                {order.notes && <Block label={t("md.notes")} value={order.notes} />}
              </dl>
            </Card>
          )}

          {order.shipments.some((s) => s.status !== "CANCELLED") && (
            <Card>
              <h2 className="mb-2 font-semibold">{t("nav.shipments")}</h2>
              <ul className="space-y-1 text-sm">
                {order.shipments.filter((s) => s.status !== "CANCELLED").map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-2">
                    <Link href={`/shipments/${s.id}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{s.number}</Link>
                    <Badge tone={s.status === "CONFIRMED" ? "green" : s.status === "DRAFT" ? "amber" : "gray"}>{t(`status.ship.${s.status}`)}</Badge>
                    <span>{formatDate(s.shippedAt ?? s.plannedDate, locale)}</span>
                    <span className="tabular-nums">{n(s.lines.reduce((a, b) => a + b.qty, 0))} {t("md.pcs")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{t("comments.title")}</h2>
            <Comments
              entityType="Order"
              entityId={order.id}
              comments={comments.map((c) => ({ id: c.id, author: userName(c.authorId), when: formatDateTime(c.createdAt, locale), body: c.body }))}
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("order.history")}</h2>
            <ol className="space-y-3 border-s-2 border-line ps-4 text-sm">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-brand-400" aria-hidden />
                  <p className="font-medium">{t.has(`history.${h.action}`) ? t(`history.${h.action}`) : h.action}</p>
                  <p className="text-xs text-muted">
                    {h.entityType !== "Order" && (
                      <>
                        {h.entityId && ENTITY_HREF[h.entityType] ? (
                          <Link href={ENTITY_HREF[h.entityType](h.entityId)} className="font-semibold text-brand-600 hover:underline dark:text-brand-300">{t.has(`audit.entity.${h.entityType}`) ? t(`audit.entity.${h.entityType}`) : h.entityType}</Link>
                        ) : (t.has(`audit.entity.${h.entityType}`) ? t(`audit.entity.${h.entityType}`) : h.entityType)}
                        {" · "}
                      </>
                    )}
                    {h.user?.fullName ?? t("audit.system")} · {formatDateTime(h.createdAt, locale)}
                  </p>
                  {h.reason && <p className="mt-0.5 text-xs">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("truncate font-medium", danger && "text-red-600")}>{value}</dd>
    </div>
  );
}
function Num({ label, v, warn, strong }: { label: string; v: string; warn?: boolean; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", warn && "text-amber-600", strong && "text-brand-700 dark:text-brand-200")}>{v}</dd>
    </div>
  );
}
function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
