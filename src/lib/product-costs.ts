import "server-only";
import { db, type Tx } from "./db";
import { productCost, type ProductCost } from "./cost";

const item = { id: true, code: true, name: true, unit: true, unitWeightKg: true, costIqd: true } as const;
export const COST_INCLUDE = {
  label: { select: item },
  components: { select: { qty: true, per: true, component: { select: item } }, orderBy: { createdAt: "asc" as const } },
};

/** Cost of one piece (IQD) for each product, worked out from its label, materials and packaging. */
export async function productCosts(ids?: string[], tx: Tx = db): Promise<Map<string, ProductCost>> {
  const list = await tx.product.findMany({ where: { kind: "PRODUCT", ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, ...COST_INCLUDE } });
  return new Map(list.map((p) => [p.id, productCost(p)]));
}
