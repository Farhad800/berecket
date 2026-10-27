import "server-only";
import { db, type Tx } from "./db";
import { defaultPieces, productCost, type CostRecipe, type ProductCost } from "./cost";

const item = { id: true, code: true, name: true, unit: true, unitWeightKg: true, costIqd: true, kind: true } as const;
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

type Entry = { recipe: CostRecipe; pieces: number; fromProduction: boolean; cost: ProductCost };

/**
 * Recipe with costs (from the batches in stock; with `starting`, from each item's starting cost), the default quantity, and the cost at that quantity, for each product.
 * A product can be made of another product made in the factory (the plastic handle of a bucket):
 * that part costs what one piece of it costs (its own label + materials + packaging). If its own cost
 * isn't complete yet, it counts as an item without a cost. Metal handles are bought items with a typed cost.
 */
export async function productCosts(ids?: string[], tx: Tx = db, opts: { starting?: boolean } = {}) {
  const [list, made, fifo] = await Promise.all([
    tx.product.findMany({ where: { kind: "PRODUCT" }, select: { id: true, ...COST_SELECT } }),
    lastMade(undefined, tx),
    opts.starting ? null : import("./fifo").then((m) => m.fifoState()),
  ]);
  if (fifo) {
    // Batches: each part is costed from its oldest batches still in stock, then at its latest cost.
    // A part whose own cost is incomplete (a handle with items missing) counts as an item without a cost.
    const withLots = <T extends { id: string; costIqd: unknown }>(c: T) => (fifo.partial(c.id) ? { ...c, costIqd: null, lots: [] }
      : { ...c, costIqd: fifo.lastUnit(c.id), lots: fifo.remaining(c.id).map((l) => ({ left: l.left, unit: l.unit() })) });
    const out = new Map<string, Entry>();
    for (const p of list) {
      if (ids && !ids.includes(p.id)) continue;
      const recipe: CostRecipe = { label: p.label ? withLots(p.label) : null, components: p.components.map((l) => ({ ...l, component: withLots(l.component) })) };
      const pieces = defaultPieces(recipe, made.get(p.id));
      out.set(p.id, { recipe, pieces, fromProduction: made.has(p.id), cost: productCost(recipe, pieces) });
    }
    return out;
  }
  const byId = new Map(list.map((p) => [p.id, p]));
  const memo = new Map<string, Entry | null>();
  const solve = (id: string, path: Set<string>): Entry | null => {
    if (memo.has(id)) return memo.get(id)!;
    const p = byId.get(id);
    if (!p || path.has(id)) return null; // unknown, or made of itself through other products
    path.add(id);
    const recipe: CostRecipe = {
      label: p.label,
      components: p.components.map((l) => {
        if (l.component.kind !== "PRODUCT") return l;
        const sub = solve(l.component.id, path);
        const ok = sub && !sub.cost.noRecipe && sub.cost.missing.length === 0;
        return { ...l, component: { ...l.component, costIqd: ok ? sub!.cost.perPiece : null } };
      }),
    };
    path.delete(id);
    const pieces = defaultPieces(recipe, made.get(id));
    const e = { recipe, pieces, fromProduction: made.has(id), cost: productCost(recipe, pieces) };
    memo.set(id, e);
    return e;
  };
  const out = new Map<string, Entry>();
  for (const p of list) if (!ids || ids.includes(p.id)) { const e = solve(p.id, new Set()); if (e) out.set(p.id, e); }
  return out;
}
