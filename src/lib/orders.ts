import "server-only";
import { db, type Tx } from "./db";

/**
 * Pieces still asked for in OPEN orders, per product. Production entries are not linked to
 * orders (owner's decision), so this is the "to make" list shown next to the daily sheet.
 */
export async function openOrderDemand(tx: Tx = db): Promise<Map<string, number>> {
  const rows = await tx.orderLine.groupBy({ by: ["productId"], where: { order: { status: "OPEN" } }, _sum: { quantity: true } });
  return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
}
