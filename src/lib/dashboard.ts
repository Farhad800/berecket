import "server-only";
import { db } from "./db";
import { factoryDay } from "./time";

const OPEN_ORDER = [
  "CONFIRMED", "WAITING_PLANNING", "SCHEDULED", "IN_PRODUCTION", "ON_HOLD", "PARTIALLY_PRODUCED",
  "AWAITING_QC", "PARTIALLY_COMPLETED", "COMPLETED", "READY_FOR_DISPATCH", "PARTIALLY_DELIVERED",
] as const;

/** Every figure is a live query — no invented statistics. */
export async function getDashboard() {
  const { start, end } = factoryDay();
  const n = (v: unknown) => Number(v ?? 0);

  const [
    activeOrders, dueToday, overdue, urgent, scheduledToday, inProduction, producedToday,
    awaitingQc, criticalIssues, machinesDown, openMaintenance, awaitingReceipt, availableStock,
    shipmentsToday, partiallyDelivered, activity,
  ] = await Promise.all([
    db.order.count({ where: { status: { in: [...OPEN_ORDER] } } }),
    db.order.count({ where: { status: { in: [...OPEN_ORDER] }, requestedDeliveryDate: { gte: start, lt: end } } }),
    db.order.count({ where: { status: { in: [...OPEN_ORDER] }, requestedDeliveryDate: { lt: start } } }),
    db.order.count({ where: { status: { in: [...OPEN_ORDER] }, priority: "URGENT" } }),
    db.productionJob.count({ where: { status: { in: ["PLANNED", "IN_PROGRESS"] }, plannedStart: { lt: end }, plannedEnd: { gte: start } } }),
    db.productionJob.count({ where: { status: "IN_PROGRESS" } }),
    db.productionEntry.aggregate({ _sum: { qtyGood: true }, where: { reportedAt: { gte: start, lt: end } } }),
    db.$queryRaw<{ q: bigint }[]>`
      SELECT COALESCE(SUM(e."qtyGood"),0) AS q FROM "ProductionEntry" e
      JOIN "Batch" b ON b.id = e."batchId" WHERE b."qcStatus" = 'PENDING'`,
    db.qualityIssue.count({ where: { severity: "CRITICAL", status: { notIn: ["RESOLVED"] } } }),
    db.machine.count({ where: { status: { in: ["DOWN", "MAINTENANCE"] }, archivedAt: null } }),
    db.maintenanceRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } } }),
    db.$queryRaw<{ q: bigint }[]>`
      SELECT COALESCE(SUM(GREATEST(p.good - COALESCE(r.rec,0), 0)),0) AS q
      FROM (SELECT "batchId", SUM("qtyGood") AS good FROM "ProductionEntry" GROUP BY "batchId") p
      JOIN "Batch" b ON b.id = p."batchId"
      LEFT JOIN (SELECT "batchId", SUM("qtyReceived") AS rec FROM "WarehouseReceipt" GROUP BY "batchId") r ON r."batchId" = p."batchId"
      WHERE b."qcStatus" <> 'REJECTED'`,
    db.stockMovement.aggregate({ _sum: { qty: true }, where: { state: "AVAILABLE" } }),
    db.shipment.count({ where: { status: { not: "CANCELLED" }, OR: [{ plannedDate: { gte: start, lt: end } }, { shippedAt: { gte: start, lt: end } }] } }),
    db.order.count({ where: { status: "PARTIALLY_DELIVERED" } }),
    db.auditLog.findMany({
      where: { NOT: { action: { startsWith: "auth." } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: { select: { fullName: true } } },
    }),
  ]);

  return {
    cards: {
      activeOrders, dueToday, overdue, urgent, scheduledToday, inProduction,
      producedToday: n(producedToday._sum.qtyGood),
      awaitingQc: n(awaitingQc[0]?.q),
      criticalIssues, machinesDown, openMaintenance,
      awaitingReceipt: n(awaitingReceipt[0]?.q),
      availableStock: n(availableStock._sum.qty),
      shipmentsToday, partiallyDelivered,
    },
    activity,
  };
}
