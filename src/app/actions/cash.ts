"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requirePermission, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { run, UserError } from "@/lib/action";
import { CURRENCIES, pickSafe, safeBalances, takeOut, paidFor, type Cur } from "@/lib/cash";
import { exchangeProblem, rateSides } from "@/lib/money";

/**
 * The safes (accountant, 25–26 Oct 2026). Money comes in by hand or from sales, goes out by hand
 * (expenses, with a category) or for purchases — always into / out of a chosen safe. IQD, USD and
 * EUR are kept apart; an exchange turns one into another, a transfer moves money between safes.
 * Money out can never exceed what that safe holds.
 */
const CUR = z.enum(["IQD", "USD", "EUR"]);
const AMOUNT = z.coerce.number().positive("The amount must be more than 0").max(100_000_000_000, "Amount too large")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "At most 2 decimals");
const fmt = (n: number, c: string) => `${n.toLocaleString("en", { maximumFractionDigits: 2 })} ${c}`;
const PATHS = ["/cash", "/dashboard", "/reports", "/stock"];
const done = (extra: string[] = []) => { for (const p of [...PATHS, ...extra]) revalidatePath(p); };

const SAFE = z.string().min(1).max(40).optional();
const moveSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  safeId: SAFE,
  currency: CUR,
  amount: AMOUNT,
  categoryId: z.string().max(40).optional(),
  party: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** Money in (by hand) or money out (an expense). */
export async function saveCashAction(input: unknown) {
  return run(async () => {
    const v = moveSchema.parse(input);
    const me = await requirePermission(v.type === "IN" ? "cash:in" : "cash:out");
    if (v.type === "OUT" && !v.categoryId) throw new UserError("Choose what the money was spent on.");
    if (v.type === "IN" && !v.note && !v.party) throw new UserError("Write where the money came from.");
    const r = await db.$transaction(async (tx) => {
      const safe = await pickSafe(tx, v.safeId, v.currency);
      let cat: { id: string; name: string; key: string | null } | null = null;
      if (v.type === "OUT") {
        cat = await tx.expenseCategory.findFirst({ where: { id: v.categoryId, archivedAt: null }, select: { id: true, name: true, key: true } });
        if (!cat) throw new UserError("That category no longer exists. Reload the page.");
        await takeOut(tx, safe, v.currency, v.amount);
      }
      const number = await nextNumber(v.type === "IN" ? "cashIn" : "cashOut", tx);
      const e = await tx.cashEntry.create({
        data: {
          number, kind: v.type === "IN" ? "DEPOSIT" : "EXPENSE", safeId: safe.id, currency: v.currency, amount: v.type === "IN" ? v.amount : -v.amount,
          categoryId: cat?.id ?? null, party: v.party || null, note: v.note || null, createdById: me.id,
        },
      });
      await audit({ userId: me.id, action: v.type === "IN" ? "cash.in" : "cash.out", entityType: "CashEntry", entityId: e.id, reason: v.note ?? null,
        after: { number, safe: safe.name, amount: fmt(v.amount, v.currency), category: cat?.name ?? null, party: v.party ?? null } }, tx);
      await notify({ type: v.type === "IN" ? "cash.in" : "cash.out", data: { number, amount: fmt(v.amount, v.currency), what: cat?.name ?? v.party ?? v.note ?? "—", by: me.fullName },
        link: `/cash/${e.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: e.id, number };
    });
    done();
    return r;
  });
}

const exchangeSchema = z.object({
  fromSafeId: SAFE, from: CUR, fromAmount: AMOUNT,
  toSafeId: SAFE, to: CUR, toAmount: AMOUNT,
  rate: z.coerce.number().positive("Type the exchange rate").max(10_000_000).refine((n) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 1e-3, "At most 6 decimals in the rate"),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Changes money from one currency into another, e.g. 1,000 USD → 1,450,000 IQD at 1 USD = 1,450 IQD.
 * Both amounts are the real money counted; the rate is "1 of the stronger currency = rate of the other".
 * The money may land in another safe than it left.
 */
export async function exchangeCashAction(input: unknown) {
  return run(async () => {
    const v = exchangeSchema.parse(input);
    const me = await requirePermission("cash:exchange");
    if (v.from === v.to) throw new UserError("Choose two different currencies. To move the same currency to another safe use Transfer.");
    const { fromStrong, strong, weak } = rateSides(v.from, v.to);
    const bad = exchangeProblem(v.fromAmount, v.toAmount, v.rate, fromStrong);
    if (bad) throw new UserError(bad);
    const r = await db.$transaction(async (tx) => {
      const src = await pickSafe(tx, v.fromSafeId, v.from), dst = await pickSafe(tx, v.toSafeId ?? src.id, v.to);
      await takeOut(tx, src, v.from, v.fromAmount);
      const number = await nextNumber("cashExchange", tx);
      const out = await tx.cashEntry.create({ data: { number, kind: "EXCHANGE", safeId: src.id, currency: v.from, amount: -v.fromAmount, rate: v.rate, note: v.note || null, createdById: me.id } });
      await tx.cashEntry.create({ data: { number, kind: "EXCHANGE", safeId: dst.id, currency: v.to, amount: v.toAmount, rate: v.rate, note: v.note || null, createdById: me.id } });
      const rate = `1 ${strong} = ${v.rate.toLocaleString("en", { maximumFractionDigits: 6 })} ${weak}`;
      await audit({ userId: me.id, action: "cash.exchange", entityType: "CashEntry", entityId: out.id, reason: v.note ?? null,
        after: { number, gave: `${fmt(v.fromAmount, v.from)} (${src.name})`, got: `${fmt(v.toAmount, v.to)} (${dst.name})`, rate } }, tx);
      await notify({ type: "cash.exchange", data: { number, gave: fmt(v.fromAmount, v.from), got: fmt(v.toAmount, v.to), by: me.fullName },
        link: `/cash/${out.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: out.id, number };
    });
    done();
    return r;
  });
}

const transferSchema = z.object({ fromSafeId: z.string().min(1).max(40), toSafeId: z.string().min(1).max(40), currency: CUR, amount: AMOUNT, note: z.string().trim().max(1000).optional() });

/** Moves money of one currency from one safe to another (TRF-2026-0001: two entries, one number). */
export async function transferCashAction(input: unknown) {
  return run(async () => {
    const v = transferSchema.parse(input);
    const me = await requirePermission("cash:transfer");
    if (v.fromSafeId === v.toSafeId) throw new UserError("Choose two different safes.");
    const r = await db.$transaction(async (tx) => {
      const src = await pickSafe(tx, v.fromSafeId, v.currency), dst = await pickSafe(tx, v.toSafeId, v.currency);
      await takeOut(tx, src, v.currency, v.amount);
      const number = await nextNumber("cashTransfer", tx);
      const out = await tx.cashEntry.create({ data: { number, kind: "TRANSFER", safeId: src.id, currency: v.currency, amount: -v.amount, note: v.note || null, createdById: me.id } });
      await tx.cashEntry.create({ data: { number, kind: "TRANSFER", safeId: dst.id, currency: v.currency, amount: v.amount, note: v.note || null, createdById: me.id } });
      await audit({ userId: me.id, action: "cash.transfer", entityType: "CashEntry", entityId: out.id, reason: v.note ?? null,
        after: { number, amount: fmt(v.amount, v.currency), from: src.name, to: dst.name } }, tx);
      await notify({ type: "cash.transfer", data: { number, amount: fmt(v.amount, v.currency), from: src.name, to: dst.name, by: me.fullName },
        link: `/cash/${out.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: out.id, number };
    });
    done();
    return r;
  });
}

const paySchema = z.object({ docId: z.string().min(1).max(40), safeId: SAFE, amount: AMOUNT, note: z.string().trim().max(1000).optional() });

/** A later payment for a Buy or Sell document: money received from / paid to the customer. */
export async function payDocAction(input: unknown) {
  return run(async () => {
    const v = paySchema.parse(input);
    const me = await requireUser();
    const doc = await db.stockDoc.findUnique({ where: { id: v.docId }, select: { id: true, type: true, number: true, currency: true, total: true, party: true, orderId: true, customerId: true } });
    if (!doc || (doc.type !== "BUY" && doc.type !== "SELL") || !doc.currency) throw new UserError("Payments are only for purchases and sales.");
    const sell = doc.type === "SELL";
    if (!(sell ? can(me, "stock:sell") || can(me, "cash:in") : can(me, "stock:buy") || can(me, "cash:out"))) throw new UserError("You don't have permission to do this.");
    const r = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"doc:" + doc.id}))`;
      const paid = (await paidFor([doc.id], tx)).get(doc.id) ?? 0;
      const owed = Math.round((Number(doc.total ?? 0) - paid) * 100) / 100;
      if (v.amount > owed + 1e-9) throw new UserError(`Only ${fmt(Math.max(owed, 0), doc.currency!)} is still owed on ${doc.number}.`);
      const safe = await pickSafe(tx, v.safeId, doc.currency as Cur);
      if (!sell) await takeOut(tx, safe, doc.currency as Cur, v.amount);
      const number = await nextNumber(sell ? "cashReceive" : "cashPay", tx);
      const e = await tx.cashEntry.create({
        data: { number, kind: sell ? "SALE" : "PURCHASE", safeId: safe.id, currency: doc.currency!, amount: sell ? v.amount : -v.amount, stockDocId: doc.id, customerId: doc.customerId, party: doc.party, note: v.note || null, createdById: me.id },
      });
      await audit({ userId: me.id, action: sell ? "cash.receive" : "cash.pay", entityType: "CashEntry", entityId: e.id, reason: v.note ?? null,
        after: { number, doc: doc.number, safe: safe.name, amount: fmt(v.amount, doc.currency!), stillOwed: fmt(owed - v.amount, doc.currency!) } }, tx);
      await notify({ type: sell ? "cash.receive" : "cash.pay", data: { number, doc: doc.number, amount: fmt(v.amount, doc.currency!), party: doc.party ?? "—", by: me.fullName },
        link: `/stock/${doc.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: e.id, number };
    });
    done([`/stock/${doc.id}`, ...(doc.orderId ? [`/orders/${doc.orderId}`] : [])]);
    return r;
  });
}

const catSchema = z.object({ name: z.string().trim().min(2, "Type a name").max(80) });

export async function addCategoryAction(input: unknown) {
  return run(async () => {
    const v = catSchema.parse(input);
    const me = await requirePermission("cash:manage");
    const dup = await db.expenseCategory.findFirst({ where: { name: { equals: v.name, mode: "insensitive" } } });
    if (dup) {
      if (dup.archivedAt) { await db.expenseCategory.update({ where: { id: dup.id }, data: { archivedAt: null } }); done(); return { id: dup.id }; }
      throw new UserError("That category already exists.");
    }
    const c = await db.expenseCategory.create({ data: { name: v.name } });
    await audit({ userId: me.id, action: "cash.categoryAdd", entityType: "ExpenseCategory", entityId: c.id, after: { name: v.name } });
    done();
    return { id: c.id };
  });
}

export async function archiveCategoryAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), archived: z.boolean() }).parse(input);
    const me = await requirePermission("cash:manage");
    const c = await db.expenseCategory.update({ where: { id: v.id }, data: { archivedAt: v.archived ? new Date() : null } });
    await audit({ userId: me.id, action: v.archived ? "cash.categoryHide" : "cash.categoryRestore", entityType: "ExpenseCategory", entityId: c.id, after: { name: c.name } });
    done();
    return { id: c.id };
  });
}

/* ─ Safes: the accountant adds safes with their own name and the currencies each holds. */
const safeSchema = z.object({
  name: z.string().trim().min(2, "Type the safe's name").max(60),
  currencies: z.array(CUR).min(1, "Tick at least one currency").max(3),
});
const safeDone = () => { done(["/stock/new", "/customers"]); };

export async function createSafeAction(input: unknown) {
  return run(async () => {
    const v = safeSchema.parse(input);
    const me = await requirePermission("cash:manage");
    const s = await db.$transaction(async (tx) => {
      if (await tx.safe.findFirst({ where: { name: { equals: v.name, mode: "insensitive" } } })) throw new UserError("A safe with this name already exists.");
      const currencies = CURRENCIES.filter((c) => v.currencies.includes(c));
      const s = await tx.safe.create({ data: { name: v.name, currencies } });
      await audit({ userId: me.id, action: "cash.safeCreate", entityType: "Safe", entityId: s.id, after: { name: v.name, currencies: currencies.join(", ") } }, tx);
      return s;
    });
    safeDone();
    return { id: s.id };
  });
}

/** Rename a safe or change its currencies. A currency can only be removed when that safe has none of it. */
export async function updateSafeAction(input: unknown) {
  return run(async () => {
    const v = safeSchema.extend({ id: z.string().min(1).max(40) }).parse(input);
    const me = await requirePermission("cash:manage");
    await db.$transaction(async (tx) => {
      const before = await tx.safe.findUnique({ where: { id: v.id } });
      if (!before) throw new UserError("That safe no longer exists.");
      if (await tx.safe.findFirst({ where: { id: { not: v.id }, name: { equals: v.name, mode: "insensitive" } } })) throw new UserError("A safe with this name already exists.");
      const currencies = CURRENCIES.filter((c) => v.currencies.includes(c));
      const bal = (await safeBalances(tx)).get(v.id);
      for (const c of before.currencies) {
        if (!currencies.includes(c as Cur) && bal && Math.abs(bal[c as Cur]) > 0.004) throw new UserError(`"${before.name}" still has ${fmt(bal[c as Cur], c)}. Move it to another safe before removing ${c}.`);
      }
      await tx.safe.update({ where: { id: v.id }, data: { name: v.name, currencies } });
      await audit({ userId: me.id, action: "cash.safeUpdate", entityType: "Safe", entityId: v.id,
        before: { name: before.name, currencies: before.currencies.join(", ") }, after: { name: v.name, currencies: currencies.join(", ") } }, tx);
    });
    safeDone();
  });
}

/** Deletes a safe that was never used (a typo, say). The main safe stays. */
export async function deleteSafeAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40) }).parse(input);
    const me = await requirePermission("cash:manage");
    await db.$transaction(async (tx) => {
      const s = await tx.safe.findUnique({ where: { id: v.id }, include: { _count: { select: { entries: true } } } });
      if (!s) throw new UserError("That safe no longer exists.");
      if (s.isMain) throw new UserError("The main safe can't be deleted.");
      if (s._count.entries > 0) throw new UserError("This safe has money movements, so it can't be deleted. You can rename it.");
      await tx.safe.delete({ where: { id: v.id } });
      await audit({ userId: me.id, action: "cash.safeDelete", entityType: "Safe", entityId: v.id, before: { name: s.name, currencies: s.currencies.join(", ") } }, tx);
    });
    safeDone();
  });
}

const editSchema = z.object({
  id: z.string().min(1).max(40),
  reason: z.string().trim().min(3, "Write why it is changed").max(500),
  amount: AMOUNT.optional(), // one-sided entries; transfer: both sides
  safeId: SAFE,
  categoryId: z.string().max(40).optional(),
  party: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1000).optional(),
  fromAmount: AMOUNT.optional(), // exchange
  toAmount: AMOUNT.optional(),
  rate: z.coerce.number().positive().max(10_000_000).optional(),
});

/** Who may change which kind of entry: the same people who may make it. */
function mayEdit(me: Awaited<ReturnType<typeof requireUser>>, kind: string) {
  if (kind === "DEPOSIT") return can(me, "cash:in");
  if (kind === "EXPENSE") return can(me, "cash:out");
  if (kind === "SALE") return can(me, "cash:in") || can(me, "stock:sell");
  if (kind === "PURCHASE") return can(me, "cash:out") || can(me, "stock:buy");
  if (kind === "EXCHANGE") return can(me, "cash:exchange");
  if (kind === "TRANSFER") return can(me, "cash:transfer");
  return false;
}

/**
 * Changes a saved money entry in place (same number): amount, safe, note, what it was spent on / where it came from;
 * an exchange its two amounts and rate; a transfer its amount. A safe can't go below zero, and money paid on a
 * receipt can't be more than its total. Who changed what, before and after, goes to the history with the reason.
 */
export async function editCashAction(input: unknown) {
  return run(async () => {
    const v = editSchema.parse(input);
    const me = await requireUser();
    const r = await db.$transaction(async (tx) => {
      const e = await tx.cashEntry.findUnique({ where: { id: v.id }, include: { safe: { select: { name: true } }, category: { select: { name: true } } } });
      if (!e) throw new UserError("That entry no longer exists. Reload the page.");
      if (!mayEdit(me, e.kind)) throw new UserError("You don't have permission to do this.");
      const group = e.kind === "EXCHANGE" || e.kind === "TRANSFER"
        ? await tx.cashEntry.findMany({ where: { number: e.number }, include: { safe: { select: { name: true } } }, orderBy: { amount: "asc" } })
        : [e];
      const touched = new Set(group.map((g) => `${g.safeId}|${g.currency}`));
      const before = group.map((g) => `${g.safe.name}: ${fmt(Number(g.amount), g.currency)}`);
      const beforeMeta = { note: e.note, party: e.party, category: e.category?.name ?? null, rate: e.rate === null ? null : Number(e.rate) };
      let afterMeta: Record<string, unknown> = {};

      if (e.kind === "EXCHANGE") {
        const [out, inn] = group; // out has the negative amount
        await tx.cashEntry.update({ where: { id: out.id }, data: { amount: -(v.fromAmount ?? -Number(out.amount)), rate: v.rate ?? out.rate, note: v.note ?? out.note } });
        await tx.cashEntry.update({ where: { id: inn.id }, data: { amount: v.toAmount ?? Number(inn.amount), rate: v.rate ?? inn.rate, note: v.note ?? inn.note } });
        afterMeta = { note: v.note ?? e.note, rate: v.rate ?? beforeMeta.rate };
      } else if (e.kind === "TRANSFER") {
        for (const g of group) await tx.cashEntry.update({ where: { id: g.id }, data: { amount: Math.sign(Number(g.amount)) * (v.amount ?? Math.abs(Number(g.amount))), note: v.note ?? g.note } });
        afterMeta = { note: v.note ?? e.note };
      } else {
        const sign = Number(e.amount) < 0 ? -1 : 1;
        const safe = v.safeId ? await pickSafe(tx, v.safeId, e.currency as Cur) : { id: e.safeId, name: e.safe.name };
        let categoryId = e.categoryId;
        if (e.kind === "EXPENSE" && v.categoryId && v.categoryId !== e.categoryId) {
          const cat = await tx.expenseCategory.findFirst({ where: { id: v.categoryId }, select: { id: true } });
          if (!cat) throw new UserError("That category no longer exists. Reload the page.");
          categoryId = cat.id;
        }
        await tx.cashEntry.update({ where: { id: e.id }, data: {
          amount: sign * (v.amount ?? Math.abs(Number(e.amount))), safeId: safe.id, categoryId,
          ...(e.kind === "DEPOSIT" || e.kind === "EXPENSE" ? { party: v.party === undefined ? e.party : v.party || null } : {}),
          note: v.note === undefined ? e.note : v.note || null,
        } });
        touched.add(`${safe.id}|${e.currency}`);
        if (e.stockDocId) {
          const d = await tx.stockDoc.findUnique({ where: { id: e.stockDocId }, select: { number: true, total: true, currency: true } });
          const paid = (await paidFor([e.stockDocId], tx)).get(e.stockDocId) ?? 0;
          if (d && d.total !== null && paid > Number(d.total) + 1e-9) throw new UserError(`Paid on ${d.number} would be ${fmt(paid, d.currency ?? "")} — more than its total ${fmt(Number(d.total), d.currency ?? "")}.`);
        }
        const cat = categoryId !== e.categoryId && categoryId ? await tx.expenseCategory.findUnique({ where: { id: categoryId }, select: { name: true } }) : null;
        afterMeta = { note: v.note === undefined ? e.note : v.note || null, party: e.kind === "DEPOSIT" || e.kind === "EXPENSE" ? (v.party === undefined ? e.party : v.party || null) : e.party, category: cat?.name ?? beforeMeta.category, safe: safe.name };
      }
      // No safe may go below zero because of the change.
      for (const k of touched) {
        const [safeId, cur] = k.split("|");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cash:" + safeId + ":" + cur}))`;
        const s = await tx.cashEntry.aggregate({ where: { safeId, currency: cur as Cur }, _sum: { amount: true } });
        if (Number(s._sum.amount ?? 0) < -0.004) {
          const name = (await tx.safe.findUnique({ where: { id: safeId }, select: { name: true } }))?.name ?? "";
          throw new UserError(`"${name}" would go below zero in ${cur}. Lower the amount taken out, or put money in first.`);
        }
      }
      const now = await tx.cashEntry.findMany({ where: { id: { in: group.map((g) => g.id) } }, include: { safe: { select: { name: true } } }, orderBy: { amount: "asc" } });
      await audit({ userId: me.id, action: "cash.edit", entityType: "CashEntry", entityId: e.id, reason: v.reason,
        before: { number: e.number, sides: before, ...beforeMeta }, after: { number: e.number, sides: now.map((g) => `${g.safe.name}: ${fmt(Number(g.amount), g.currency)}`), ...afterMeta } }, tx);
      await notify({ type: "cash.edited", data: { number: e.number, by: me.fullName, reason: v.reason }, link: `/cash/${e.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: e.id, number: e.number, customerId: e.customerId, docId: e.stockDocId };
    });
    done([`/cash/${r.id}`, ...(r.customerId ? [`/customers/${r.customerId}`] : []), ...(r.docId ? [`/stock/${r.docId}`] : [])]);
    return { number: r.number };
  });
}
