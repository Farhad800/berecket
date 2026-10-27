/**
 * Go-live tools: remove test/demo data before the factory starts using the system for real.
 * Used by the admin "System" page and by the CLI (scripts/go-live.ts). No "server-only"
 * import so the CLI can run it with tsx.
 *
 * What is NEVER deleted: employees (except demo.* accounts when asked), roles, permissions,
 * departments, settings, defect types, storage locations and the audit log.
 */
import type { PrismaClient } from "@prisma/client";

export type ResetScope = "operations" | "everything";

const OPERATIONAL_ENTITIES = ["Order", "ProductionEntry", "MaintenanceRequest", "ServiceReport", "QcInspection", "QualityIssue", "StockMovement", "StockDoc", "CashEntry"];
const MASTER_ENTITIES = ["Product", "Machine", "Mold"];
const OPERATIONAL_COUNTERS = ["order-", "maintenance-", "service-", "inspection-", "issue-", "stock", "cash", "salesInvoice", "purchaseInvoice"];

/** How many records a reset would delete (shown before the admin confirms). */
export async function resetPreview(db: PrismaClient) {
  const [orders, entries, maintenance, serviceReports, inspections, issues, movements, products, machines, molds, demoUsers] =
    await Promise.all([
      db.order.count(), db.productionEntry.count(),
      db.maintenanceRequest.count(), db.serviceReport.count(), db.qcInspection.count(), db.qualityIssue.count(),
      db.stockMovement.count(), db.product.count(), db.machine.count(), db.mold.count(),
      db.user.count({ where: { username: { startsWith: "demo." } } }),
    ]);
  return {
    operations: { orders, entries, inspections, issues, movements, maintenance, serviceReports },
    master: { products, machines, molds },
    demoUsers,
  };
}

/**
 * Deletes operational records (orders, production, QC, stock, maintenance) and, for scope "everything", master data too.
 * Runs in one transaction: either everything is removed or nothing is.
 * Returns the storage keys of attachments whose files should then be deleted.
 */
export async function resetData(db: PrismaClient, scope: ResetScope) {
  const entities = scope === "everything" ? [...OPERATIONAL_ENTITIES, ...MASTER_ENTITIES] : OPERATIONAL_ENTITIES;
  return db.$transaction(
    async (tx) => {
      const files = await tx.attachment.findMany({ where: { entityType: { in: entities } }, select: { storageKey: true } });
      await tx.attachment.deleteMany({ where: { entityType: { in: entities } } });
      await tx.comment.deleteMany({ where: { entityType: { in: entities } } });
      await tx.notification.deleteMany({});
      await tx.stockMovement.deleteMany({});
      await tx.cashEntry.deleteMany({});
      await tx.stockDoc.deleteMany({});
      await tx.correctiveAction.deleteMany({});
      await tx.qualityIssue.deleteMany({});
      await tx.qcInspection.deleteMany({});
      await tx.serviceReport.deleteMany({});
      await tx.maintenanceRequest.deleteMany({});
      await tx.productionEntry.deleteMany({});
      await tx.orderLine.deleteMany({});
      await tx.order.deleteMany({});
      await tx.counter.deleteMany({ where: { OR: OPERATIONAL_COUNTERS.map((p) => ({ name: { startsWith: p } })) } });
      if (scope === "everything") {
        await tx.preventiveTask.deleteMany({});
        await tx.mold.deleteMany({});
        await tx.machine.deleteMany({});
        await tx.product.deleteMany({});
        await tx.customer.deleteMany({});
        await tx.counter.deleteMany({ where: { name: { in: ["customer"] } } });
        await tx.safe.deleteMany({ where: { isMain: false } }); // extra safes go; the main safe stays (empty)
      } else {
        // Test maintenance may have left machines "down" — start clean.
        await tx.machine.updateMany({ where: { status: { not: "RETIRED" } }, data: { status: "AVAILABLE" } });
        await tx.mold.updateMany({ where: { status: { not: "RETIRED" }, currentMachineId: null }, data: { status: "AVAILABLE" } });
        await tx.mold.updateMany({ where: { status: { not: "RETIRED" }, currentMachineId: { not: null } }, data: { status: "IN_USE" } });
      }
      return files.map((f) => f.storageKey);
    },
    { timeout: 120_000 },
  );
}

/** Deletes the demo.* employee accounts. Their past actions stay in the audit log as "System". */
export async function removeDemoUsers(db: PrismaClient) {
  const users = await db.user.findMany({ where: { username: { startsWith: "demo." } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return 0;
  await db.$transaction([
    db.session.deleteMany({ where: { userId: { in: ids } } }),
    db.notification.deleteMany({ where: { userId: { in: ids } } }),
    db.auditLog.updateMany({ where: { userId: { in: ids } }, data: { userId: null } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return ids.length;
}

/** Products, stickers and materials, and how many of them are already used (orders, production or stock). */
export async function itemsPreview(db: PrismaClient) {
  const [byKind, used] = await Promise.all([
    db.product.groupBy({ by: ["kind"], _count: true }),
    db.product.count({ where: { OR: [{ orderLines: { some: {} } }, { entries: { some: {} } }, { stockMovements: { some: {} } }] } }),
  ]);
  const n = (k: string) => byKind.find((b) => b.kind === k)?._count ?? 0;
  return { products: n("PRODUCT"), stickers: n("STICKER"), materials: n("MATERIAL"), used };
}

/**
 * Removes every product, sticker and material so a corrected list can be imported in their place.
 * Machines, molds, employees and the audit log stay. Refuses while any item is used by orders,
 * production or stock — those records must be cleared first, so history never points at nothing.
 */
export async function removeAllItems(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const used = await tx.product.count({ where: { OR: [{ orderLines: { some: {} } }, { entries: { some: {} } }, { stockMovements: { some: {} } }] } });
    if (used > 0) return { removed: 0, used };
    const files = await tx.attachment.findMany({ where: { entityType: "Product" }, select: { storageKey: true } });
    await tx.attachment.deleteMany({ where: { entityType: "Product" } });
    await tx.comment.deleteMany({ where: { entityType: "Product" } });
    const { count } = await tx.product.deleteMany({});
    return { removed: count, used: 0, files: files.map((f) => f.storageKey) };
  }, { timeout: 120_000 });
}
