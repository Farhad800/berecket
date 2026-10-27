import "server-only";
import { cache } from "react";
import { db, type Tx } from "./db";

/**
 * Batches ("lots") and oldest-first costing (owner, 27 Oct 2026).
 *
 * Every purchase line is a batch of that item at its own cost: price × the purchase's rate, in IQD
 * (the discount never changes it). Every production run is a batch of that product whose cost is the
 * real cost of the batches its label, materials and packaging were taken from, ÷ the pieces made.
 * Whatever leaves the warehouse (production use, sale, waste, count down, out) is taken from the
 * oldest batch first. Production corrections give back to the batches they took from.
 *
 * Nothing is stored for this: stock movements are never edited (only added), and each one keeps its
 * price and its document's rate, so the batches are rebuilt from the history every time.
 *
 * Stock that was there before FIFO_START is one opening batch at the item's "starting cost"
 * (the cost typed on the item; for a product, its recipe at those starting costs). Stock taken
 * when no batch is left is costed at the batch that later fills the gap, else the latest known cost.
 */
export const FIFO_START = new Date(process.env.FIFO_START ?? "2026-10-28T00:00:00+03:00");

export type LotSource = "OPENING" | "BUY" | "INPUT" | "PRODUCTION" | "RETURN" | "OTHER" | "SHORT";
export type Lot = {
  id: number; itemId: string; at: Date; source: LotSource;
  docId: string | null; docNumber: string | null; entryId: string | null;
  qtyIn: number; left: number;
  price: number | null; currency: string | null; rate: number | null; // as typed (purchase / input)
  /** IQD per unit; null = no cost known. Production batches are worked out at the end. */
  unit: () => number | null;
  filledBy?: Lot; // a gap: the batch that later filled it
};
type Alloc = { lot: Lot; qty: number };

const EPS = 0.0005;

export type FifoState = {
  lots: Map<string, Lot[]>; // per item, oldest first (no SHORT lots)
  entryCost: (entryId: string) => { cost: number; complete: boolean; pieces: number } | null;
  /** Remaining batches (left > 0), oldest first. */
  remaining: (itemId: string) => Lot[];
  /** Cost of the latest batch (or the starting cost): what stock taken beyond the batches costs. */
  lastUnit: (itemId: string) => number | null;
  /** Some of the stock (or, with none, the latest cost) has a cost with items missing (a product whose recipe has items without a cost). */
  partial: (itemId: string) => boolean;
  /** Value of the stock on hand (Σ left × cost); null part = batches without a cost. */
  value: (itemId: string) => { value: number; noCost: number; qty: number };
};

type StartCost = (itemId: string) => number | null;

/** Rebuilds all batches. `startCost` gives the starting cost of each item (opening stock and fallback). */
export async function buildFifo(startCost: StartCost, tx: Tx = db, startPartial: Set<string> = new Set()): Promise<FifoState> {
  const [opening, moves] = await Promise.all([
    tx.stockMovement.groupBy({ by: ["productId"], where: { createdAt: { lt: FIFO_START } }, _sum: { qty: true } }),
    tx.stockMovement.findMany({
      where: { createdAt: { gte: FIFO_START } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, productId: true, type: true, qty: true, entryId: true, unitPrice: true, createdAt: true, doc: { select: { id: true, number: true, invoiceNo: true, type: true, currency: true, rate: true } } },
    }),
  ]);

  let seq = 0;
  const lots = new Map<string, Lot[]>();
  const shortOpen = new Map<string, Lot[]>(); // gaps (stock taken with no batch) waiting to be filled
  const allocs = new Map<string, Alloc[]>(); // what each production entry (or "none") took, per item: `${entry}|${item}`
  const entryLot = new Map<string, Lot>();
  const entryAllocs = new Map<string, Alloc[]>(); // all allocations of an entry (for its cost)
  const listOf = (id: string) => { let l = lots.get(id); if (!l) lots.set(id, (l = [])); return l; };

  const lastUnitOf = (itemId: string, l: Lot[]): number | null => {
    for (let i = l.length - 1; i >= 0; i--) { const u = l[i].unit(); if (u !== null) return u; }
    return startCost(itemId);
  };
  const lastUnit = (itemId: string) => lastUnitOf(itemId, lots.get(itemId) ?? []);
  let done = false; // production costs are only final once every movement is read

  const addLot = (itemId: string, at: Date, qty: number, source: LotSource, unit: () => number | null, extra: Partial<Lot> = {}): Lot => {
    const lot: Lot = { id: ++seq, itemId, at, source, docId: null, docNumber: null, entryId: null, qtyIn: qty, left: qty, price: null, currency: null, rate: null, unit, ...extra };
    // Fill gaps first: those pieces were already used; this batch is what they cost.
    const gaps = shortOpen.get(itemId) ?? [];
    while (gaps.length && lot.left > EPS) {
      const g = gaps[0];
      const take = Math.min(g.left, lot.left);
      g.left -= take; lot.left -= take;
      if (!g.filledBy) g.filledBy = lot;
      if (g.left <= EPS) gaps.shift();
    }
    listOf(itemId).push(lot);
    return lot;
  };

  /** Takes qty out oldest-first; returns the allocations (a gap batch when nothing is left). */
  const take = (itemId: string, at: Date, qty: number, prefer?: Lot[]): Alloc[] => {
    const out: Alloc[] = [];
    let need = qty;
    const order = [...(prefer ?? []), ...listOf(itemId)];
    for (const lot of order) {
      if (need <= EPS) break;
      if (lot.left <= EPS) continue;
      const q = Math.min(lot.left, need);
      lot.left -= q; need -= q;
      out.push({ lot, qty: q });
    }
    if (need > EPS) {
      const before = [...listOf(itemId)];
      const gap: Lot = { id: ++seq, itemId, at, source: "SHORT", docId: null, docNumber: null, entryId: null, qtyIn: need, left: need, price: null, currency: null, rate: null, unit: () => (gap.filledBy ? gap.filledBy.unit() : lastUnitOf(itemId, before)) };
      let g = shortOpen.get(itemId); if (!g) shortOpen.set(itemId, (g = []));
      g.push(gap);
      out.push({ lot: gap, qty: need });
    }
    return out;
  };

  /** Gives back to the batches an earlier take came from (newest first). */
  const giveBack = (stack: Alloc[], qty: number): number => {
    let rest = qty;
    for (let i = stack.length - 1; i >= 0 && rest > EPS; i--) {
      const a = stack[i];
      const q = Math.min(a.qty, rest);
      a.qty -= q; rest -= q;
      if (a.lot.source === "SHORT") {
        // a gap given back: it no longer needs filling
        a.lot.left = Math.max(0, a.lot.left - q);
      } else a.lot.left += q;
      if (a.qty <= EPS) stack.splice(i, 1);
    }
    return rest;
  };

  for (const o of opening) {
    const q = Number(o._sum.qty ?? 0);
    if (Math.abs(q) <= EPS) continue;
    if (q > 0) addLot(o.productId, FIFO_START, q, "OPENING", () => startCost(o.productId));
    else take(o.productId, FIFO_START, -q);
  }

  for (const m of moves) {
    const q = Number(m.qty);
    const item = m.productId;
    const key = `${m.entryId ?? "none"}|${item}`;
    if (m.type === "PRODUCTION") {
      if (q > 0) {
        const existing = m.entryId ? entryLot.get(m.entryId) : undefined;
        if (existing) { existing.qtyIn += q; existing.left += q; continue; } // more pieces added to the same entry
        const entryId = m.entryId;
        const start = startCost(item);
        const lot = addLot(item, m.createdAt, q, "PRODUCTION", () => {
          if (!entryId) return start; // entry since removed: no longer linked
          const c = costOfEntry(entryId);
          return c && c.pieces > EPS ? c.cost / c.pieces : start;
        }, { entryId });
        if (entryId) entryLot.set(entryId, lot);
      } else if (q < 0) {
        // Correction down: fewer pieces in that run.
        const lot = m.entryId ? entryLot.get(m.entryId) : [...listOf(item)].reverse().find((l) => l.source === "PRODUCTION" && l.left > EPS);
        let need = -q;
        if (lot) {
          const fromLot = Math.min(lot.left, need);
          lot.left -= fromLot; need -= fromLot;
          if (m.entryId) lot.qtyIn -= -q; // the run itself was smaller
        }
        if (need > EPS) take(item, m.createdAt, need);
      }
      continue;
    }
    if (m.type === "USE") {
      let stack = allocs.get(key); if (!stack) allocs.set(key, (stack = []));
      if (q < 0) {
        const a = take(item, m.createdAt, -q);
        stack.push(...a);
        if (m.entryId) { let ea = entryAllocs.get(m.entryId); if (!ea) entryAllocs.set(m.entryId, (ea = [])); ea.push(...a); }
      } else if (q > 0) {
        const rest = giveBack(stack, q);
        if (rest > EPS) { const before = [...listOf(item)]; addLot(item, m.createdAt, rest, "RETURN", () => lastUnitOf(item, before)); }
      }
      continue;
    }
    if (q < 0) { take(item, m.createdAt, -q); continue; }
    if (q > 0) {
      const d = m.doc;
      const price = m.unitPrice === null ? null : Number(m.unitPrice);
      if ((m.type === "BUY" || m.type === "INPUT") && price !== null && d) {
        const rate = d.currency === "IQD" || !d.currency ? 1 : d.rate === null ? null : Number(d.rate);
        const u = rate === null ? null : price * rate;
        const start = startCost(item);
        addLot(item, m.createdAt, q, m.type, () => (u === null ? start : u), { docId: d.id, docNumber: d.type === "BUY" ? d.invoiceNo ?? d.number : d.number, price, currency: d.currency ?? "IQD", rate: d.currency && d.currency !== "IQD" ? rate : null });
      } else {
        const start = startCost(item);
        addLot(item, m.createdAt, q, m.type === "BUY" || m.type === "INPUT" ? m.type : "OTHER", () => start, d ? { docId: d.id, docNumber: d.type === "BUY" ? d.invoiceNo ?? d.number : d.number } : {});
      }
    }
  }

  done = true;
  // Production run costs, worked out once everything is known (a run can use handles made earlier).
  const memo = new Map<string, { cost: number; complete: boolean; pieces: number } | null>();
  const busy = new Set<string>();
  function costOfEntry(entryId: string) {
    if (!done) throw new Error("fifo: cost asked before all movements were read");
    if (memo.has(entryId)) return memo.get(entryId)!;
    const lot = entryLot.get(entryId);
    if (!lot || busy.has(entryId)) return null;
    busy.add(entryId);
    let cost = 0, complete = true;
    for (const a of entryAllocs.get(entryId) ?? []) {
      if (a.qty <= EPS) continue;
      const u = a.lot.unit();
      if (u === null) complete = false; else cost += u * a.qty;
    }
    busy.delete(entryId);
    const r = { cost, complete, pieces: lot.qtyIn };
    memo.set(entryId, r);
    return r;
  }

  const remaining = (itemId: string) => (lots.get(itemId) ?? []).filter((l) => l.left > EPS);
  const lotPartial = (l: Lot): boolean => {
    if (l.source === "PRODUCTION" && l.entryId) { const c = costOfEntry(l.entryId); return !!c && c.pieces > EPS ? !c.complete : startPartial.has(l.itemId); }
    return l.price === null && startPartial.has(l.itemId);
  };
  return {
    partial(itemId) {
      const open = remaining(itemId);
      if (open.length) return open.some(lotPartial);
      const all = lots.get(itemId) ?? [];
      return all.length ? lotPartial(all[all.length - 1]) : startPartial.has(itemId);
    },
    lots,
    entryCost: costOfEntry,
    remaining,
    lastUnit,
    value(itemId) {
      let value = 0, noCost = 0, qty = 0;
      for (const l of remaining(itemId)) {
        qty += l.left;
        const u = l.unit();
        if (u === null) noCost += l.left; else value += u * l.left;
      }
      // Stock below zero (a gap not yet filled) counts against the value at its cost.
      for (const g of shortOpen.get(itemId) ?? []) {
        if (g.left <= EPS) continue;
        qty -= g.left;
        const u = g.unit();
        if (u !== null) value -= u * g.left;
      }
      return { value, noCost, qty };
    },
  };
}

/** One rebuild per request. */
export const fifoState = cache(async () => {
  const { productCosts } = await import("./product-costs");
  const [items, recipes] = await Promise.all([
    db.product.findMany({ select: { id: true, kind: true, costIqd: true } }),
    productCosts(undefined, db, { starting: true }),
  ]);
  const start = new Map<string, number | null>();
  const partial = new Set<string>(); // products whose recipe has items without a cost: cost shown without them, marked *
  for (const it of items) {
    if (it.kind === "PRODUCT") {
      const c = recipes.get(it.id);
      start.set(it.id, c && !c.cost.noRecipe ? c.cost.perPiece : null);
      if (c && !c.cost.noRecipe && c.cost.missing.length) partial.add(it.id);
    } else start.set(it.id, it.costIqd === null ? null : Number(it.costIqd));
  }
  return buildFifo((id) => start.get(id) ?? null, db, partial);
});
