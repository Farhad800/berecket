"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requirePermission, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { run, UserError } from "@/lib/action";
import { paidFor, takeOut, type Cur } from "@/lib/cash";

/**
 * The safe (accountant, 25 Oct 2026). Money comes in by hand or from sales, goes out by hand
 * (expenses, with a category) or for purchases. IQD, USD and EUR are kept apart; an exchange
 * turns one into another at a typed rate. Money out can never exceed what the safe holds.
 */
const CUR = z.enum(["IQD", "USD", "EUR"]);
const AMOUNT = z.coerce.number().positive("The amount must be more than 0").max(100_000_000_000, "Amount too large")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "At most 2 decimals");
const fmt = (n: number, c: string) => `${n.toLocaleString("en", { maximumFractionDigits: 2 })} ${c}`;
const PATHS = ["/cash", "/dashboard", "/reports", "/stock"];
const done = (extra: string[] = []) => { for (const p of [...PATHS, ...extra]) revalidatePath(p); };

const moveSchema = z.object({
  type: z.enum(["IN", "OUT"]),
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
      let cat: { id: string; name: string; key: string | null } | null = null;
      if (v.type === "OUT") {
        cat = await tx.expenseCategory.findFirst({ where: { id: v.categoryId, archivedAt: null }, select: { id: true, name: true, key: true } });
        if (!cat) throw new UserError("That category no longer exists. Reload the page.");
        await takeOut(tx, v.currency, v.amount);
      }
      const number = await nextNumber(v.type === "IN" ? "cashIn" : "cashOut", tx);
      const e = await tx.cashEntry.create({
        data: {
          number, kind: v.type === "IN" ? "DEPOSIT" : "EXPENSE", currency: v.currency, amount: v.type === "IN" ? v.amount : -v.amount,
          categoryId: cat?.id ?? null, party: v.party || null, note: v.note || null, createdById: me.id,
        },
      });
      await audit({ userId: me.id, action: v.type === "IN" ? "cash.in" : "cash.out", entityType: "CashEntry", entityId: e.id, reason: v.note ?? null,
        after: { number, amount: fmt(v.amount, v.currency), category: cat?.name ?? null, party: v.party ?? null } }, tx);
      await notify({ type: v.type === "IN" ? "cash.in" : "cash.out", data: { number, amount: fmt(v.amount, v.currency), what: cat?.name ?? v.party ?? v.note ?? "—", by: me.fullName },
        link: `/cash/${e.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: e.id, number };
    });
    done();
    return r;
  });
}

const exchangeSchema = z.object({
  from: CUR, to: CUR, amount: AMOUNT,
  rate: z.coerce.number().positive("Type the exchange rate").max(10_000_000),
  note: z.string().trim().max(1000).optional(),
});

/** Changes money from one currency into another inside the safe, e.g. 100 USD → 145,000 IQD. */
export async function exchangeCashAction(input: unknown) {
  return run(async () => {
    const v = exchangeSchema.parse(input);
    const me = await requirePermission("cash:exchange");
    if (v.from === v.to) throw new UserError("Choose two different currencies.");
    const got = Math.round(v.amount * v.rate * 100) / 100;
    if (!(got > 0)) throw new UserError("The amount received would be 0. Check the rate.");
    const r = await db.$transaction(async (tx) => {
      await takeOut(tx, v.from, v.amount);
      const number = await nextNumber("cashExchange", tx);
      const out = await tx.cashEntry.create({ data: { number, kind: "EXCHANGE", currency: v.from, amount: -v.amount, rate: v.rate, note: v.note || null, createdById: me.id } });
      await tx.cashEntry.create({ data: { number, kind: "EXCHANGE", currency: v.to, amount: got, rate: v.rate, note: v.note || null, createdById: me.id } });
      await audit({ userId: me.id, action: "cash.exchange", entityType: "CashEntry", entityId: out.id, reason: v.note ?? null,
        after: { number, gave: fmt(v.amount, v.from), got: fmt(got, v.to), rate: v.rate } }, tx);
      await notify({ type: "cash.exchange", data: { number, gave: fmt(v.amount, v.from), got: fmt(got, v.to), by: me.fullName },
        link: `/cash/${out.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: out.id, number, got };
    });
    done();
    return r;
  });
}

const paySchema = z.object({ docId: z.string().min(1).max(40), amount: AMOUNT, note: z.string().trim().max(1000).optional() });

/** A later payment for a Buy or Sell document: money received from the customer / paid to the supplier. */
export async function payDocAction(input: unknown) {
  return run(async () => {
    const v = paySchema.parse(input);
    const me = await requireUser();
    const doc = await db.stockDoc.findUnique({ where: { id: v.docId }, select: { id: true, type: true, number: true, currency: true, total: true, party: true, orderId: true } });
    if (!doc || (doc.type !== "BUY" && doc.type !== "SELL") || !doc.currency) throw new UserError("Payments are only for purchases and sales.");
    const sell = doc.type === "SELL";
    if (!(sell ? can(me, "stock:sell") || can(me, "cash:in") : can(me, "stock:buy") || can(me, "cash:out"))) throw new UserError("You don't have permission to do this.");
    const r = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"doc:" + doc.id}))`;
      const paid = (await paidFor([doc.id], tx)).get(doc.id) ?? 0;
      const owed = Math.round((Number(doc.total ?? 0) - paid) * 100) / 100;
      if (v.amount > owed + 1e-9) throw new UserError(`Only ${fmt(Math.max(owed, 0), doc.currency!)} is still owed on ${doc.number}.`);
      if (!sell) await takeOut(tx, doc.currency as Cur, v.amount);
      const number = await nextNumber(sell ? "cashReceive" : "cashPay", tx);
      const e = await tx.cashEntry.create({
        data: { number, kind: sell ? "SALE" : "PURCHASE", currency: doc.currency!, amount: sell ? v.amount : -v.amount, stockDocId: doc.id, party: doc.party, note: v.note || null, createdById: me.id },
      });
      await audit({ userId: me.id, action: sell ? "cash.receive" : "cash.pay", entityType: "CashEntry", entityId: e.id, reason: v.note ?? null,
        after: { number, doc: doc.number, amount: fmt(v.amount, doc.currency!), stillOwed: fmt(owed - v.amount, doc.currency!) } }, tx);
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
