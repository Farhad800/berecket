/** Pure maths shared by the server (stock use) and the product page (preview). See consumption.ts for the rules. */
export type Need = { componentId: string; code: string; name: string; unit: string; qty: number; missingWeight?: boolean };

export type Recipe = {
  labelId: string | null;
  piecesPerCarton?: number | null;
  label: { id: string; code: string; name: string; unit: string } | null;
  components: { qty: unknown; per: "PIECE" | "CARTON"; component: { id: string; code: string; name: string; unit: string; unitWeightKg: unknown } }[];
};
const kg = (u: string) => u.toLowerCase() === "kg";
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Pure maths: what `pieces` of a product need. Also used for the preview on the product page. */
export function needsFor(p: Recipe, pieces: number): Need[] {
  const out = new Map<string, Need>();
  const add = (c: { id: string; code: string; name: string; unit: string }, qty: number, missingWeight = false) => {
    if (!(qty > 0) && !missingWeight) return;
    const cur = out.get(c.id);
    if (cur) { cur.qty = r3(cur.qty + qty); cur.missingWeight ||= missingWeight; }
    else out.set(c.id, { componentId: c.id, code: c.code, name: c.name, unit: c.unit, qty: r3(qty), missingWeight });
  };
  if (pieces <= 0) return [];
  if (p.label) add(p.label, pieces);
  for (const line of p.components) {
    const q = Number(line.qty), c = line.component;
    if (!(q > 0)) continue;
    if (line.per === "PIECE") {
      add(c, kg(c.unit) ? (q * pieces) / 1000 : Math.ceil(q * pieces - 1e-9));
    } else {
      // Packaging: q = how many products go into ONE of this item (one carton holds 1,800; one nylon bag holds 60).
      // Always rounded up — a started carton or bag is used.
      const n = Math.ceil(pieces / q - 1e-9);
      if (kg(c.unit)) {
        const w = Number(c.unitWeightKg ?? 0);
        if (w > 0) add(c, n * w); else add(c, 0, true);
      } else add(c, n);
    }
  }
  return [...out.values()];
}

