import "server-only";
import { db } from "./db";
import { dayValue, todayYmd } from "./production";

/** Every figure is a live query — no invented statistics. */
export async function getDashboard() {
  const today = todayYmd();
  const weekAgo = new Date(dayValue(today).getTime() - 6 * 86_400_000);
  const n = (v: unknown) => Number(v ?? 0);

  const [openOrders, openPieces, producedToday, productsToday, producedWeek, notInspected, rejectedWeek, criticalIssues, openIssues, machinesDown, openMaintenance, stock, outWeek, activity] =
    await Promise.all([
      db.order.count({ where: { status: "OPEN" } }),
      db.orderLine.aggregate({ _sum: { quantity: true }, where: { order: { status: "OPEN" } } }),
      db.productionEntry.aggregate({ _sum: { quantity: true }, where: { day: dayValue(today) } }),
      db.productionEntry.groupBy({ by: ["productId"], where: { day: dayValue(today) } }),
      db.productionEntry.aggregate({ _sum: { quantity: true }, where: { day: { gte: weekAgo } } }),
      db.productionEntry.count({ where: { qcStatus: "NOT_INSPECTED", day: { gte: weekAgo } } }),
      db.qcInspection.aggregate({ _sum: { qtyRejected: true }, where: { inspectedAt: { gte: weekAgo } } }),
      db.qualityIssue.count({ where: { severity: "CRITICAL", status: { not: "RESOLVED" } } }),
      db.qualityIssue.count({ where: { status: { not: "RESOLVED" } } }),
      db.machine.count({ where: { status: { in: ["DOWN", "MAINTENANCE"] }, archivedAt: null } }),
      db.maintenanceRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } } }),
      db.stockMovement.aggregate({ _sum: { qty: true }, where: { product: { kind: "PRODUCT" } } }),
      db.stockMovement.aggregate({ _sum: { qty: true }, where: { type: { in: ["OUT", "OUTPUT", "SELL"] }, createdAt: { gte: weekAgo }, product: { kind: "PRODUCT" } } }),
      db.auditLog.findMany({
        where: { NOT: { action: { startsWith: "auth." } } },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { user: { select: { fullName: true } } },
      }),
    ]);

  return {
    cards: {
      openOrders,
      openPieces: n(openPieces._sum.quantity),
      producedToday: n(producedToday._sum.quantity),
      productsToday: productsToday.length,
      producedWeek: n(producedWeek._sum.quantity),
      notInspected,
      rejectedWeek: n(rejectedWeek._sum.qtyRejected),
      criticalIssues,
      openIssues,
      machinesDown,
      openMaintenance,
      stock: n(stock._sum.qty),
      outWeek: Math.abs(n(outWeek._sum.qty)),
    },
    activity,
  };
}
