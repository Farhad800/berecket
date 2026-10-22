import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toFactoryDateInput } from "@/lib/time";
import { getLineProgress } from "@/lib/orders";
import { getBatchBalances } from "@/lib/stock";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import OrderPicker from "./order-picker";
import ShipmentForm from "./shipment-form";

export const metadata = { title: "New shipment" };
const SHIPPABLE_QC = ["RELEASED", "APPROVED", "PARTIAL"] as const;

export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await pageUser("shipments:create");
  const t = await getTranslations();
  const sp = await searchParams;

  // Orders that have approved, unreserved stock right now.
  const avail = await db.stockMovement.groupBy({ by: ["orderLineId"], where: { state: "AVAILABLE", orderLineId: { not: null } }, _sum: { qty: true } });
  const lineIds = avail.filter((a) => (a._sum.qty ?? 0) > 0).map((a) => a.orderLineId!);
  const orders = await db.order.findMany({
    where: { lines: { some: { id: { in: lineIds } } }, status: { notIn: ["DRAFT", "CANCELLED", "DELIVERED", "ON_HOLD"] } },
    orderBy: { requestedDeliveryDate: "asc" },
    select: { id: true, number: true, customer: { select: { name: true } } },
  });

  const picker = <OrderPicker orders={orders.map((o) => ({ value: o.id, label: o.number, hint: o.customer.name }))} selected={sp.order} />;
  if (!sp.order) {
    return (
      <>
        <PageHeader title={t("ship.new")} subtitle={t("ship.newHint")} />
        {orders.length === 0 ? <EmptyState>{t("ship.nothingToShip")}</EmptyState> : <Card>{picker}</Card>}
      </>
    );
  }

  const order = await db.order.findUnique({
    where: { id: sp.order },
    include: { customer: true, lines: { orderBy: { lineNo: "asc" }, include: { product: true, batches: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!order) return <EmptyState>{t("common.empty")}</EmptyState>;
  const progress = await getLineProgress([order.id]);
  const drafts = await db.shipmentLine.groupBy({ by: ["orderLineId"], where: { shipment: { orderId: order.id, status: "DRAFT" } }, _sum: { qty: true } });
  const bal = await getBatchBalances(order.lines.flatMap((l) => l.batches.map((b) => b.id)));

  const lines = order.lines.map((l) => {
    const p = progress.get(l.id)!;
    const inDrafts = drafts.find((d) => d.orderLineId === l.id)?._sum.qty ?? 0;
    return {
      id: l.id,
      lineNo: l.lineNo,
      product: `${l.product.name} (${l.product.code})`,
      ordered: p.quantity,
      shipped: p.shipped,
      inDrafts,
      open: Math.max(p.quantity - p.shipped - inDrafts, 0),
      batches: l.batches
        .map((b) => ({ id: b.id, number: b.number, qc: b.qcStatus, available: bal.get(b.id)!.AVAILABLE, blocked: bal.get(b.id)!.QUARANTINE + bal.get(b.id)!.REJECTED }))
        .filter((b) => b.available > 0 || b.blocked > 0)
        .map((b) => ({ ...b, shippable: SHIPPABLE_QC.includes(b.qc as (typeof SHIPPABLE_QC)[number]) })),
    };
  });

  return (
    <>
      <PageHeader title={t("ship.new")} subtitle={`${order.number} · ${order.customer.name}`} />
      <Card className="mb-4">{picker}</Card>
      {order.packaging && <div className="mb-4"><Alert tone="blue"><b>{t("order.packaging")}:</b> {order.packaging}</Alert></div>}
      <ShipmentForm orderId={order.id} lines={lines} today={toFactoryDateInput(new Date())} />
    </>
  );
}
