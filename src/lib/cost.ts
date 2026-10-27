/**
 * Product cost (accountant, 26–27 Oct 2026), always in IQD, worked out the way the accountant does it:
 * for a number of pieces made, take the SAME quantities production takes out of stock
 * (recipe-math.ts: label 1 per piece, grams per piece, cartons and bags rounded up to whole ones,
 * nylon by the kg of the bags used), multiply each by its cost per unit, add up, and divide by the pieces.
 * Example: 1,000 pieces, 880 in a carton → 2 full cartons are charged, not 1.14.
 */
import { needsFor, type Recipe } from "./recipe-math";

/**
 * costIqd: cost of one unit when no batch is left (the latest batch, else the starting cost).
 * lots: batches still in stock, oldest first — the amounts used are costed from these first (oldest first).
 */
export type CostItem = { id: string; code: string; name: string; unit: string; unitWeightKg: unknown; costIqd: unknown; lots?: { left: number; unit: number | null }[] };

/** Cost of taking `qty` from the batches, oldest first; beyond them at `fallback`. null = some of it has no cost. */
export function fifoTake(lots: { left: number; unit: number | null }[] | undefined, fallback: number | null, qty: number): number | null {
  let need = qty, cost = 0;
  for (const l of lots ?? []) {
    if (need <= 1e-9) break;
    const q = Math.min(l.left, need);
    if (q <= 0) continue;
    if (l.unit === null) return null;
    cost += q * l.unit; need -= q;
  }
  if (need > 1e-9) { if (fallback === null) return null; cost += need * fallback; }
  return cost;
}
export type CostRecipe = {
  label: CostItem | null;
  components: { qty: unknown; per: "PIECE" | "CARTON"; component: CostItem }[];
};
export type CostPart = { id: string; code: string; name: string; unit: string; qty: number; unitCost: number | null; cost: number | null; why: "label" | "made" | "pack" };
export type ProductCost = { pieces: number; parts: CostPart[]; total: number; perPiece: number; missing: CostPart[]; noRecipe: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cost of making `pieces` pieces, and of one piece of that run. */
export function productCost(p: CostRecipe, pieces: number): ProductCost {
  const items = new Map<string, CostItem>();
  const why = new Map<string, CostPart["why"]>();
  if (p.label) { items.set(p.label.id, p.label); why.set(p.label.id, "label"); }
  for (const l of p.components) {
    items.set(l.component.id, l.component);
    if (!why.has(l.component.id)) why.set(l.component.id, l.per === "PIECE" ? "made" : "pack");
  }
  const n = Math.max(0, Math.floor(pieces));
  const recipe = { labelId: p.label?.id ?? null, label: p.label, components: p.components } as unknown as Recipe;
  const parts: CostPart[] = needsFor(recipe, n).map((need) => {
    const it = items.get(need.componentId)!;
    const u = it.costIqd === null || it.costIqd === undefined ? null : Number(it.costIqd);
    const cost = need.missingWeight ? null : fifoTake(it.lots, u, need.qty);
    // shown per unit: the average of the batches used (the same as the cost per unit when one batch covers it)
    const unitCost = cost !== null && need.qty > 0 ? cost / need.qty : u;
    return { id: it.id, code: it.code, name: it.name, unit: it.unit, qty: need.qty, unitCost, cost, why: why.get(it.id)! };
  });
  const missing = parts.filter((x) => x.cost === null);
  const total = r2(parts.reduce((s, x) => s + (x.cost ?? 0), 0));
  return { pieces: n, parts, total, perPiece: n > 0 ? total / n : 0, missing, noRecipe: p.label === null && p.components.length === 0 };
}

/** The quantity a cost is shown for when none is typed: the last production entry, else one full carton. */
export function defaultPieces(p: CostRecipe, lastMade: number | null | undefined) {
  if (lastMade && lastMade > 0) return lastMade;
  const carton = p.components.find((c) => c.per === "CARTON" && c.component.unit.toLowerCase() !== "kg");
  const pack = carton ?? p.components.find((c) => c.per === "CARTON");
  return pack ? Math.max(1, Math.round(Number(pack.qty))) : 1000;
}

/** IQD with up to 2 decimals (153,100.5 · 29.53), more only for amounts below 1 IQD. */
export const fmtIqd = (n: number) => n.toLocaleString("en", { maximumFractionDigits: Math.abs(n) >= 1 || n === 0 ? 2 : 4 });
