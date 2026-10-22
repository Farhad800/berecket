import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db, type Tx } from "./db";

export type LineProgress = {
  lineId: string;
  quantity: number;
  planned: number; // sum of planned qty on non-cancelled jobs
  produced: number; // good pieces reported
  defective: number;
  pendingQc: number; // produced in batches awaiting inspection (QC-required products)
  blocked: number; // on hold or rejected by QC
  released: number; // good pieces not blocked by QC (shippable once received)
  received: number; // physically received into the warehouse
  shipped: number; // on confirmed shipments
  remainingToProduce: number;
  remainingToDeliver: number;
};

/**
 * Quantities per order line, all derived from records (never typed totals).
 * Released = produced in RELEASED/APPROVED batches, plus the accepted share of PARTIAL batches.
 */
export async function getLineProgress(orderIds: string[], tx: Tx = db): Promise<Map<string, LineProgress>> {
  const map = new Map<string, LineProgress>();
  if (orderIds.length === 0) return map;
  const rows = await tx.$queryRaw<
    {
      lineId: string; quantity: number; planned: bigint; produced: bigint; defective: bigint;
      pendingQc: bigint; blocked: bigint; released: bigint; received: bigint; shipped: bigint;
    }[]
  >`
    WITH lines AS (
      SELECT l.id, l.quantity FROM "OrderLine" l WHERE l."orderId" = ANY(${orderIds})
    ),
    batch_qty AS (
      SELECT b.id, b."orderLineId", b."qcStatus",
             COALESCE(SUM(e."qtyGood"),0) AS good, COALESCE(SUM(e."qtyDefective"),0) AS bad
      FROM "Batch" b LEFT JOIN "ProductionEntry" e ON e."batchId" = b.id
      WHERE b."orderLineId" IN (SELECT id FROM lines)
      GROUP BY b.id
    ),
    latest_insp AS (
      SELECT DISTINCT ON (i."batchId") i."batchId", i."qtyHold" + i."qtyRejected" AS blocked
      FROM "QcInspection" i WHERE i."batchId" IN (SELECT id FROM batch_qty)
      ORDER BY i."batchId", i."inspectedAt" DESC
    )
    SELECT l.id AS "lineId", l.quantity,
      COALESCE((SELECT SUM(j."plannedQty") FROM "ProductionJob" j WHERE j."orderLineId" = l.id AND j.status <> 'CANCELLED'),0) AS planned,
      COALESCE((SELECT SUM(bq.good) FROM batch_qty bq WHERE bq."orderLineId" = l.id),0) AS produced,
      COALESCE((SELECT SUM(bq.bad) FROM batch_qty bq WHERE bq."orderLineId" = l.id),0) AS defective,
      COALESCE((SELECT SUM(bq.good) FROM batch_qty bq WHERE bq."orderLineId" = l.id AND bq."qcStatus" = 'PENDING'),0) AS "pendingQc",
      COALESCE((SELECT SUM(CASE WHEN bq."qcStatus" IN ('HOLD','REJECTED') THEN bq.good
                                WHEN bq."qcStatus" = 'PARTIAL' THEN LEAST(bq.good, COALESCE(li.blocked,0)) ELSE 0 END)
                FROM batch_qty bq LEFT JOIN latest_insp li ON li."batchId" = bq.id WHERE bq."orderLineId" = l.id),0) AS blocked,
      COALESCE((SELECT SUM(CASE WHEN bq."qcStatus" IN ('RELEASED','APPROVED') THEN bq.good
                                WHEN bq."qcStatus" = 'PARTIAL' THEN GREATEST(bq.good - COALESCE(li.blocked,0),0) ELSE 0 END)
                FROM batch_qty bq LEFT JOIN latest_insp li ON li."batchId" = bq.id WHERE bq."orderLineId" = l.id),0) AS released,
      COALESCE((SELECT SUM(r."qtyReceived") FROM "WarehouseReceipt" r WHERE r."orderLineId" = l.id),0) AS received,
      COALESCE((SELECT SUM(sl.qty) FROM "ShipmentLine" sl JOIN "Shipment" s ON s.id = sl."shipmentId"
                WHERE sl."orderLineId" = l.id AND s.status = 'CONFIRMED'),0) AS shipped
    FROM lines l`;
  for (const r of rows) {
    const n = (v: bigint) => Number(v);
    const produced = n(r.produced);
    const shipped = n(r.shipped);
    map.set(r.lineId, {
      lineId: r.lineId,
      quantity: r.quantity,
      planned: n(r.planned),
      produced,
      defective: n(r.defective),
      pendingQc: n(r.pendingQc),
      blocked: n(r.blocked),
      released: n(r.released),
      received: n(r.received),
      shipped,
      remainingToProduce: Math.max(r.quantity - n(r.released) - n(r.pendingQc), 0),
      remainingToDeliver: Math.max(r.quantity - shipped, 0),
    });
  }
  return map;
}

/** Statuses a person sets on purpose; everything else is calculated from records. */
const MANUAL: OrderStatus[] = ["DRAFT", "ON_HOLD", "CANCELLED"];
export const OPEN_STATUSES: OrderStatus[] = [
  "CONFIRMED", "WAITING_PLANNING", "SCHEDULED", "IN_PRODUCTION", "ON_HOLD", "PARTIALLY_PRODUCED",
  "AWAITING_QC", "PARTIALLY_COMPLETED", "COMPLETED", "READY_FOR_DISPATCH", "PARTIALLY_DELIVERED",
];

/**
 * Works out the order status from what actually happened. An order is never marked
 * Delivered just because production finished — only shipments (or an authorised exception) do that.
 */
export function deriveStatus(
  current: OrderStatus,
  lines: LineProgress[],
  jobs: { status: string }[],
  hasException: boolean,
): OrderStatus {
  if (MANUAL.includes(current)) return current;
  if (lines.length === 0) return "WAITING_PLANNING";

  const all = (f: (l: LineProgress) => boolean) => lines.every(f);
  const any = (f: (l: LineProgress) => boolean) => lines.some(f);

  if (hasException || all((l) => l.shipped >= l.quantity)) return "DELIVERED";
  if (any((l) => l.shipped > 0)) return "PARTIALLY_DELIVERED";

  const shippable = (l: LineProgress) => Math.min(l.released, l.received);
  if (all((l) => shippable(l) >= l.quantity)) return "READY_FOR_DISPATCH";
  if (all((l) => l.released >= l.quantity)) return "COMPLETED";
  if (all((l) => l.released + l.pendingQc >= l.quantity) && any((l) => l.pendingQc > 0)) return "AWAITING_QC";

  const running = jobs.some((j) => j.status === "IN_PROGRESS");
  if (any((l) => l.released >= l.quantity)) return running ? "IN_PRODUCTION" : "PARTIALLY_COMPLETED";
  if (any((l) => l.produced > 0)) return running ? "IN_PRODUCTION" : "PARTIALLY_PRODUCED";
  if (running) return "IN_PRODUCTION";
  if (all((l) => l.planned >= l.quantity)) return "SCHEDULED";
  return "WAITING_PLANNING";
}

/** Recalculate and store the status after any change that could affect it. Returns the new status. */
export async function recomputeOrderStatus(orderId: string, tx: Tx = db): Promise<OrderStatus> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, deliveryException: true, lines: { select: { id: true, jobs: { select: { status: true } } } } },
  });
  const progress = await getLineProgress([orderId], tx);
  const lines = order.lines.map((l) => progress.get(l.id)!).filter(Boolean);
  const jobs = order.lines.flatMap((l) => l.jobs);
  const next = deriveStatus(order.status, lines, jobs, !!order.deliveryException);
  if (next !== order.status) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: next,
        ...(next === "COMPLETED" || next === "READY_FOR_DISPATCH" ? { completedAt: new Date() } : {}),
        ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
    });
  }
  return next;
}

export const STATUS_TONE: Record<OrderStatus, "gray" | "blue" | "green" | "amber" | "red" | "purple"> = {
  DRAFT: "gray",
  CONFIRMED: "blue",
  WAITING_PLANNING: "amber",
  SCHEDULED: "blue",
  IN_PRODUCTION: "purple",
  ON_HOLD: "red",
  PARTIALLY_PRODUCED: "purple",
  AWAITING_QC: "amber",
  PARTIALLY_COMPLETED: "purple",
  COMPLETED: "green",
  READY_FOR_DISPATCH: "green",
  PARTIALLY_DELIVERED: "blue",
  DELIVERED: "green",
  CANCELLED: "gray",
};

export const PRIORITY_TONE = { LOW: "gray", NORMAL: "blue", HIGH: "amber", URGENT: "red" } as const;
