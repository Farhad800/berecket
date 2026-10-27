import "server-only";
import { db, type Tx } from "./db";
import { defaultPieces, productCost, type CostRecipe, type ProductCost } from "./cost";

const item = { id: true, code: true, name: true, unit: true, unitWeightKg: true, costIqd: true } as const;
export const COST_SELECT = {
  label: { select: item },
  components: { select: { qty: true, per: true, component: { select: item } }, orderBy: { createdAt: "asc" as const } },
};

/** The last production quantity of each product (the run its cost is shown for by default). */
export async function lastMade(ids?: string[], tx: Tx = db) {
  const rows = await tx.productionEntry.findMany({
    where: { quantity: { gt: 0 }, ...(ids ? { productId: { in: ids } } : {}) },
    orderBy: [{ productId: "asc" }, { day: "desc" }, { createdAt: "desc" }],
    distinct: ["productId"], select: { productId: true, quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, r.quantity]));
}

/** Recipe with costs, the default quantity, and the cost at that quantity, for each product. */
export async function productCosts(ids?: string[], tx: Tx = db) {
  const [list, made] = await Promise.all([
    tx.product.findMany({ where: { kind: "PRODUCT", ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, ...COST_SELECT } }),
    lastMade(ids, tx),
  ]);
  const out = new Map<string, { recipe: CostRecipe; pieces: number; fromProduction: boolean; cost: ProductCost }>();
  for (const p of list) {
    const pieces = defaultPieces(p, made.get(p.id));
    out.set(p.id, { recipe: p, pieces, fromProduction: made.has(p.id), cost: productCost(p, pieces) });
  }
  return out;
}
