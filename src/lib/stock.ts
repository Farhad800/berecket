import "server-only";
import { db, type Tx } from "./db";

/** Stock on hand per product = SUM of its ledger movements (never a typed total). */
export async function getStock(productIds?: string[], tx: Tx = db): Promise<Map<string, number>> {
  const rows = await tx.stockMovement.groupBy({
    by: ["productId"],
    where: productIds ? { productId: { in: productIds } } : {},
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.productId, Number(r._sum.qty ?? 0)]));
}

/** Locks the product row so two people can't take the same stock out at the same moment. */
export async function lockProduct(productId: string, tx: Tx) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
}
