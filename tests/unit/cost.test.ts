import { describe, expect, it } from "vitest";
import { productCost } from "@/lib/cost";

const it_ = (id: string, unit: string, costIqd: number | null, unitWeightKg: number | null = null) => ({ id, code: id, name: id, unit, unitWeightKg, costIqd });

describe("product cost (IQD per piece)", () => {
  const recipe = {
    label: it_("LBL", "pcs", 25),
    components: [
      { qty: 2.1, per: "PIECE" as const, component: it_("PP", "kg", 1740) }, // 2.1 g of PP at 1,740 IQD/kg
      { qty: 1800, per: "CARTON" as const, component: it_("CARTON", "pcs", 500) }, // one carton holds 1,800
      { qty: 60, per: "CARTON" as const, component: it_("NYLON", "kg", 3000, 0.012) }, // one 12 g bag holds 60
    ],
  };
  it("adds label + made of + packaging, per piece, without rounding cartons up", () => {
    const c = productCost(recipe);
    expect(c.total).toBeCloseTo(25 + 3.654 + 500 / 1800 + 0.6, 6);
    expect(c.missing).toHaveLength(0);
    expect(c.parts.map((p) => p.why)).toEqual(["label", "made", "pack", "pack"]);
  });
  it("lists items without a cost and leaves them out of the total", () => {
    const c = productCost({ ...recipe, label: it_("LBL", "pcs", null) });
    expect(c.missing.map((m) => m.id)).toEqual(["LBL"]);
    expect(c.total).toBeCloseTo(3.654 + 500 / 1800 + 0.6, 6);
  });
  it("a kg bag without its weight can't be costed", () => {
    const c = productCost({ label: null, components: [{ qty: 60, per: "CARTON", component: it_("NYLON", "kg", 3000) }] });
    expect(c.missing).toHaveLength(1);
  });
  it("no recipe → nothing to cost", () => {
    expect(productCost({ label: null, components: [] }).noRecipe).toBe(true);
  });
});
