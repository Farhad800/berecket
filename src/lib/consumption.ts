import "server-only";
import type { Tx } from "./db";
import { getStock } from "./stock";
import { needsFor, type Recipe } from "./recipe-math";
const r3 = (n: number) => Math.round(n * 1000) / 1000;
export type { Need } from "./recipe-math";

/**
 * What a production entry uses from stock — its label (1 per piece), its recipe ("made of")
 * and its packaging — taken off automatically when daily production is entered or corrected.
 *
 * Rules (owner, 25 Oct 2026):
 *  - label: 1 per piece
 *  - PIECE lines: kg items in grams per piece; piece items (e.g. handles) per piece
 *  - packaging lines ("CARTON" basis) say how many products go into one carton / one nylon bag;
 *      used = ⌈pieces ÷ that number⌉ (rounded up: a started carton or bag is used);
 *      bags of an item stocked in kg are turned into kg with that item's weight per bag
 *  - not enough stock never blocks production: stock may go below zero and the warehouse is warned
 * Each entry keeps a running balance: corrections only post the difference.
 */
export type Shortage = { code: string; name: string; unit: string; stock: number };
const RECIPE_SELECT = {
  labelId: true, piecesPerCarton: true, code: true,
  label: { select: { id: true, code: true, name: true, unit: true } },
  components: { select: { qty: true, per: true, component: { select: { id: true, code: true, name: true, unit: true, unitWeightKg: true } } } },
} as const;

/** Brings the stock used by one entry in line with its current quantity (or `quantity` when given, e.g. 0 before deleting). */
export async function syncConsumption(entryId: string, tx: Tx, userId: string, quantity?: number): Promise<string[]> {
  const e = await tx.productionEntry.findUniqueOrThrow({ where: { id: entryId }, select: { id: true, quantity: true, day: true, shift: true, product: { select: RECIPE_SELECT } } });
  const pieces = quantity ?? e.quantity;
  const need = new Map(needsFor(e.product as unknown as Recipe, pieces).map((n) => [n.componentId, n.qty]));
  const used = await tx.stockMovement.groupBy({ by: ["productId"], where: { entryId, type: "USE" }, _sum: { qty: true } });
  const ids = new Set([...need.keys(), ...used.map((u) => u.productId)]);
  const label = `${e.product.code} · ${e.day.toISOString().slice(0, 10)} · shift ${e.shift}`;
  const touched: string[] = [];
  for (const id of ids) {
    const already = -Number(used.find((u) => u.productId === id)?._sum.qty ?? 0); // positive amount used so far
    const diff = r3((need.get(id) ?? 0) - already);
    if (Math.abs(diff) < 0.0005) continue;
    await tx.stockMovement.create({ data: { productId: id, type: "USE", qty: -diff, entryId, reason: `Production ${label}`, createdById: userId } });
    if (diff > 0) touched.push(id);
  }
  return touched;
}

/** Items (from those just used) that are now below zero. */
export async function shortages(ids: string[], tx: Tx): Promise<Shortage[]> {
  if (!ids.length) return [];
  const uniq = [...new Set(ids)];
  const [stock, items] = await Promise.all([getStock(uniq, tx), tx.product.findMany({ where: { id: { in: uniq } }, select: { id: true, code: true, name: true, unit: true } })]);
  return items.map((i) => ({ code: i.code, name: i.name, unit: i.unit, stock: stock.get(i.id) ?? 0 })).filter((s) => s.stock < -0.0005);
}
