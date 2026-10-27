import { describe, expect, it } from "vitest";
import { defaultPieces, productCost } from "@/lib/cost";

const it_ = (id: string, unit: string, costIqd: number | null, unitWeightKg: number | null = null) => ({ id, code: id, name: id, unit, unitWeightKg, costIqd });

describe("product cost the accountant's way (same quantities production takes from stock)", () => {
  // The accountant's check (27 Oct 2026): 1,000 pieces, 50 g raw material at 3,000 IQD/kg,
  // 880 pieces in one carton (1,500 IQD) and in one nylon bag (nylon 750 IQD/kg, 0.067 kg a bag).
  const bowl = {
    label: null,
    components: [
      { qty: 50, per: "PIECE" as const, component: it_("RAW", "kg", 3000) },
      { qty: 880, per: "CARTON" as const, component: it_("CARTON", "pcs", 1500) },
      { qty: 880, per: "CARTON" as const, component: it_("NYLON", "kg", 750, 0.067) },
    ],
  };
  it("charges full cartons and the nylon kg of whole bags: 153,100.5 IQD for 1,000 pieces", () => {
    const c = productCost(bowl, 1000);
    expect(c.parts.map((p) => [p.id, p.qty, p.cost])).toEqual([["RAW", 50, 150000], ["CARTON", 2, 3000], ["NYLON", 0.134, 100.5]]);
    expect(c.total).toBe(153100.5);
    expect(c.perPiece).toBeCloseTo(153.1005, 6);
  });
  it("one full carton is the cheapest run per piece", () => {
    expect(productCost(bowl, 880).perPiece).toBeCloseTo(150 + 1500 / 880 + (0.067 * 750) / 880, 6);
  });
  it("label 1 per piece; items without a cost are listed and left out", () => {
    const c = productCost({ ...bowl, label: it_("LBL", "pcs", null) }, 1000);
    expect(c.parts[0]).toMatchObject({ id: "LBL", qty: 1000, cost: null, why: "label" });
    expect(c.missing.map((m) => m.id)).toEqual(["LBL"]);
    expect(c.total).toBe(153100.5);
  });
  it("a kg bag without its weight can't be costed", () => {
    expect(productCost({ label: null, components: [{ qty: 60, per: "CARTON", component: it_("NYLON", "kg", 3000) }] }, 100).missing).toHaveLength(1);
  });
  it("default run: last production, else one full carton", () => {
    expect(defaultPieces(bowl, 1234)).toBe(1234);
    expect(defaultPieces(bowl, null)).toBe(880);
    expect(defaultPieces({ label: null, components: [] }, null)).toBe(1000);
  });
});
