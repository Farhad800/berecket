/**
 * Product cost (accountant, 26 Oct 2026): what one piece costs in IQD, from its label (1 per piece),
 * what it is made of (grams / pieces per piece) and its packaging (one carton / bag holds N pieces).
 * Uses the same quantities as the stock use on production (recipe-math.ts), but per piece and without
 * rounding up cartons. Item costs are kept per unit (1 pc or 1 kg) in IQD.
 */
export type CostItem = { id: string; code: string; name: string; unit: string; unitWeightKg: unknown; costIqd: unknown };
export type CostRecipe = {
  label: CostItem | null;
  components: { qty: unknown; per: "PIECE" | "CARTON"; component: CostItem }[];
};
export type CostPart = { id: string; code: string; name: string; unit: string; perPiece: number; unitCost: number | null; cost: number | null; why: "label" | "made" | "pack" };
export type ProductCost = { parts: CostPart[]; total: number; missing: CostPart[]; noRecipe: boolean };

const isKg = (u: string) => u.toLowerCase() === "kg";
const unitCost = (c: CostItem) => (c.costIqd === null || c.costIqd === undefined ? null : Number(c.costIqd));

export function productCost(p: CostRecipe): ProductCost {
  const parts: CostPart[] = [];
  const add = (c: CostItem, perPiece: number, why: CostPart["why"]) => {
    const u = unitCost(c);
    parts.push({ id: c.id, code: c.code, name: c.name, unit: c.unit, perPiece, unitCost: u, cost: u === null ? null : perPiece * u, why });
  };
  if (p.label) add(p.label, 1, "label");
  for (const line of p.components) {
    const q = Number(line.qty), c = line.component;
    if (!(q > 0)) continue;
    if (line.per === "PIECE") add(c, isKg(c.unit) ? q / 1000 : q, "made"); // grams → kg, or pieces per piece
    else {
      // one of this item holds q pieces → 1/q of it per piece (kg items: weight of one bag / q)
      if (isKg(c.unit)) {
        const w = Number(c.unitWeightKg ?? 0);
        add(c, w > 0 ? w / q : 0, "pack");
        if (!(w > 0)) parts[parts.length - 1].cost = null;
      } else add(c, 1 / q, "pack");
    }
  }
  const missing = parts.filter((x) => x.cost === null);
  const total = Math.round(parts.reduce((s, x) => s + (x.cost ?? 0), 0) * 1e6) / 1e6;
  return { parts, total, missing, noRecipe: parts.length === 0 };
}

/** IQD with up to 2 decimals for small costs (a label costs 15.25 IQD), whole dinars for big ones. */
export const fmtIqd = (n: number) => n.toLocaleString("en", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 1 ? 2 : 4 });
