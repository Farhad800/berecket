"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { MONEY_PERMS, canSeeMoney, requirePermission } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { run, UserError } from "@/lib/action";
import { shortages, type Shortage } from "@/lib/consumption";
import { pickSafe, takeOut, type Cur } from "@/lib/cash";
import { PRICE_DECIMALS, docTotal, discountProblem, maxDecimals, saleTotals } from "@/lib/money";
import type { Permission } from "@/lib/permissions";

/**
 * Stock movements section (owner, 25 Oct 2026): every manual change of stock is one document —
 * Input / Output (no money, with a reason) or Buy / Sell (price per line in IQD or USD, typed
 * customer account (bought from or sold to), invoice number; a sale can be linked to an order). Production and what it
 * uses still move stock automatically. Going below zero is allowed; the warehouse is warned.
 */
const TYPES = ["INPUT", "OUTPUT", "BUY", "SELL"] as const;
type DocType = (typeof TYPES)[number];
const REASONS = ["RETURN", "TRANSFER", "COUNT", "DAMAGE", "SAMPLE", "OTHER"] as const;
const PERM: Record<DocType, Permission> = { INPUT: "stock:input", OUTPUT: "stock:output", BUY: "stock:buy", SELL: "stock:sell" };
const NUM = { INPUT: "stockInput", OUTPUT: "stockOutput", BUY: "stockBuy", SELL: "stockSell" } as const;
const isIn = (t: DocType) => t === "INPUT" || t === "BUY";
const money = (t: DocType) => t === "BUY" || t === "SELL";

const discount = z.object({ kind: z.enum(["PERCENT", "AMOUNT"]), value: z.coerce.number().min(0, "A discount can't be negative").max(1_000_000_000) }).optional();

const schema = z.object({
  type: z.enum(TYPES),
  reason: z.enum(REASONS).optional(),
  party: z.string().trim().max(160).optional(),
  invoiceNo: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).regex(/^[0-9+()\-\s]*$/, "The phone number can only have digits, spaces, + and -").optional(),
  currency: z.enum(["IQD", "USD", "EUR"]).optional(),
  /** Buy / Sell: paid now, goes into (sale) or out of (purchase) the safe. Empty = nothing paid yet. */
  paid: z.coerce.number().min(0, "Paid can't be negative").max(100_000_000_000).optional(),
  safeId: z.string().min(1).max(40).optional(), // the safe the paid-now money goes into / comes out of
  orderId: z.string().max(40).optional(),
  /** Buy / Sell: the customer account (bought from or sold to). Sell: where the goods go; a discount on the whole invoice. */
  customerId: z.string().max(40).optional(),
  /** Buy: their own invoice number, and (USD/EUR) the day's rate to IQD. */
  supplierRef: z.string().trim().max(80).optional(),
  rate: z.coerce.number().positive("Type the rate: 1 USD/EUR = how many IQD").max(10_000_000).refine((n) => maxDecimals(n, 6), "At most 6 decimals in the rate").optional(),
  delivery: z.string().trim().max(300).optional(),
  discount,
  note: z.string().trim().max(1000).optional(),
  /** Editing a saved document (same number): its id and why it is changed. */
  editId: z.string().min(1).max(40).optional(),
  editReason: z.string().trim().max(500).optional(),
  lines: z.array(z.object({
    itemId: z.string().min(1, "Choose the item").max(40),
    qty: z.coerce.number().positive("Quantity must be more than 0").max(50_000_000),
    unitPrice: z.coerce.number().min(0, "Price can't be negative").max(1_000_000_000)
      .refine((n) => maxDecimals(n, PRICE_DECIMALS), `A price can have at most ${PRICE_DECIMALS} decimals`).optional(),
    discount,
  })).min(1, "Add at least one item").max(500, "At most 500 lines"),
});

export type DocResult = { id: string; number: string; shortages: Shortage[] };

/** A saved document with its lines and payments, held (row lock) until the edit is saved. */
async function lockedDoc(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "StockDoc" WHERE id = ${id} FOR UPDATE`;
  const d = await tx.stockDoc.findUnique({ where: { id }, include: { lines: { include: { product: { select: { code: true } } } }, payments: { select: { amount: true } } } });
  if (!d) throw new UserError("That receipt no longer exists. Reload the page.");
  return d;
}

export async function saveStockDocAction(input: unknown) {
  return run(async (): Promise<DocResult> => {
    const raw = schema.parse(input);
    const me = await requirePermission(PERM[raw.type]);
    const t = raw.type;
    const editing = !!raw.editId;
    if (editing && (raw.editReason ?? "").length < 3) throw new UserError("Write why the receipt is changed.");
    if (!money(t) && !raw.reason) throw new UserError("Choose the reason.");
    if (money(t) && !raw.customerId) throw new UserError("Choose the customer.");
    if (!money(t) && (raw.discount || raw.lines.some((l) => l.discount?.value))) throw new UserError("Discounts are only for purchases and sales.");
    if (money(t)) {
      if (!raw.currency) throw new UserError("Choose the currency (IQD, USD or EUR).");
      if (t === "BUY" && raw.currency !== "IQD" && !raw.rate) throw new UserError(`Type today's rate: 1 ${raw.currency} = how many IQD?`);
      if (raw.lines.some((l) => l.unitPrice === undefined)) throw new UserError("Enter the price for every line.");
    }
    // Input: an optional cost per line (price, currency, rate) — that batch's cost; empty = the item's starting cost.
    const costed = t === "INPUT" && canSeeMoney(me) && raw.lines.some((l) => l.unitPrice !== undefined);
    if (t === "INPUT" && !costed) raw.lines.forEach((l) => { l.unitPrice = undefined; });
    if (costed) {
      raw.currency ??= "IQD";
      if (raw.currency !== "IQD" && !raw.rate) throw new UserError(`Type today's rate: 1 ${raw.currency} = how many IQD?`);
    }
    if (raw.orderId && t !== "SELL") throw new UserError("Only a sale can be linked to an order.");
    const ids = raw.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw new UserError("The same item is on two lines. Put it on one line.");

    // Buy / Sell: line discounts, then the invoice discount (one rule shared with the form and the receipt).
    // On a purchase the discount only lowers what is owed to the customer we bought from; the line price stays the bought price.
    const sale = money(t) ? saleTotals(raw.lines.map((l) => ({ qty: l.qty, price: l.unitPrice ?? 0, discount: l.discount })), raw.discount) : null;
    if (sale) {
      raw.lines.forEach((l, i) => { const p = discountProblem(sale.lines[i].gross, l.discount); if (p) throw new UserError(`Line ${i + 1}: ${p}`); });
      const p = discountProblem(sale.subtotal, raw.discount); if (p) throw new UserError(`Invoice discount: ${p}`);
    }
    const total = sale ? sale.total : money(t) ? docTotal(raw.lines.map((l) => ({ qty: l.qty, price: l.unitPrice ?? 0 }))) : null;
    const paid = money(t) && !editing ? Math.round((raw.paid ?? 0) * 100) / 100 : 0; // editing: payments stay as they are
    if (total !== null && paid > total + 1e-9) throw new UserError("Paid now can't be more than the total.");

    const result = await db.$transaction(async (tx) => {
      // Editing: the saved document, held so two edits (or an edit and a payment) go one after the other.
      const old = editing ? await lockedDoc(tx, raw.editId!) : null;
      if (old && old.type !== t) throw new UserError("A receipt keeps its type. Make a new one instead.");
      if (old && !canSeeMoney(me) && old.lines.some((l) => l.unitPrice !== null)) throw new UserError("This receipt has prices; only people who see money can change it.");
      const keep = new Set(old?.lines.map((l) => l.productId) ?? []); // items already on it may be archived since
      const items = await tx.product.findMany({ where: { id: { in: ids }, OR: [{ archivedAt: null }, { id: { in: [...keep] } }] }, select: { id: true, code: true, unit: true } });
      if (items.length !== ids.length) throw new UserError("One of the items no longer exists. Reload the page.");
      const item = (id: string) => items.find((i) => i.id === id)!;
      for (const l of raw.lines) {
        const it = item(l.itemId);
        if (it.unit.toLowerCase() !== "kg" && !Number.isInteger(l.qty)) throw new UserError(`${it.code} is counted in pieces — whole numbers only.`);
        // Tolerant check: 1.001 × 1000 is 1000.9999… in floating point, which a strict comparison refused.
        if (it.unit.toLowerCase() === "kg" && !maxDecimals(l.qty, 3)) throw new UserError(`${it.code}: at most 3 decimals.`);
      }
      if (raw.orderId && !(await tx.order.count({ where: { id: raw.orderId } }))) throw new UserError("That order no longer exists.");
      // Buy / Sell: booked to a customer account; the name/phone are copied so the document keeps them as they were.
      let party = raw.party || null, phone = money(t) ? raw.phone || null : null, invoiceNo = raw.invoiceNo || null;
      if (money(t)) {
        const c = await tx.customer.findFirst({ where: { id: raw.customerId, ...(old?.customerId === raw.customerId ? {} : { archivedAt: null }) } });
        if (!c) throw new UserError("That customer no longer exists. Reload the page.");
        party = c.name; phone = raw.phone || c.phone;
        // automatic numbers: purchase PUR-2026-0001 · sale invoice INV-2026-0001 (an edited receipt keeps its own)
        invoiceNo = old ? old.invoiceNo : await nextNumber(t === "BUY" ? "purchaseInvoice" : "salesInvoice", tx);
      }
      if (old && money(t)) {
        const paidSoFar = Math.round(old.payments.reduce((x, p) => x + Math.abs(Number(p.amount)), 0) * 100) / 100;
        if (old.payments.length && raw.currency !== old.currency) throw new UserError(`Money was already paid on this receipt in ${old.currency}, so its currency can't change.`);
        if (total! + 1e-9 < paidSoFar) throw new UserError(`${paidSoFar.toLocaleString("en")} ${old.currency} was already paid on this receipt — the new total can't be less than that.`);
      }
      const number = old ? old.number : await nextNumber(NUM[t], tx);
      // Every field is written, so an edit also clears what no longer applies.
      const fields = {
        type: t, reason: money(t) ? null : raw.reason!, party, phone, invoiceNo,
        currency: money(t) || costed ? raw.currency! : null,
        rate: (t === "BUY" || costed) && raw.currency && raw.currency !== "IQD" ? raw.rate! : null,
        orderId: raw.orderId || null, note: raw.note || null, total,
        customerId: money(t) ? raw.customerId! : null,
        supplierRef: t === "BUY" ? raw.supplierRef || raw.invoiceNo || null : null,
        delivery: t === "SELL" ? raw.delivery || null : null,
        subtotal: sale ? sale.subtotal : null,
        discountKind: sale && raw.discount?.value ? raw.discount.kind : null,
        discountValue: sale && raw.discount?.value ? raw.discount.value : null,
        discount: sale ? sale.discount || null : null,
      };
      const doc = old
        ? await tx.stockDoc.update({ where: { id: old.id }, data: fields })
        : await tx.stockDoc.create({ data: { number, ...fields, createdById: me.id } });
      if (old) {
        // Same number, new lines: the old lines are replaced (stock, batches and balances follow), kept at the receipt's time.
        await tx.stockMovement.deleteMany({ where: { docId: old.id } });
        if (money(t)) await tx.cashEntry.updateMany({ where: { stockDocId: old.id }, data: { customerId: raw.customerId!, party } });
      }
      await tx.stockMovement.createMany({
        data: raw.lines.map((l, i) => ({
          productId: l.itemId, type: t, qty: isIn(t) ? l.qty : -l.qty, docId: doc.id, reference: number, ...(old ? { createdAt: old.createdAt } : {}),
          unitPrice: money(t) ? l.unitPrice! : costed ? l.unitPrice ?? null : null, reason: raw.note || null, createdById: old ? old.createdById : me.id,
          ...(sale && l.discount?.value ? { discountKind: l.discount.kind, discountValue: l.discount.value, discount: sale.lines[i].discount } : {}),
        })),
      });
      if (paid > 0) {
        const safe = await pickSafe(tx, raw.safeId, raw.currency as Cur);
        if (t === "BUY") await takeOut(tx, safe, raw.currency as Cur, paid);
        await tx.cashEntry.create({
          data: { number: await nextNumber(t === "SELL" ? "cashReceive" : "cashPay", tx), kind: t === "SELL" ? "SALE" : "PURCHASE", safeId: safe.id, currency: raw.currency!,
            amount: t === "SELL" ? paid : -paid, stockDocId: doc.id, customerId: raw.customerId!, party, createdById: me.id },
        });
      }
      const lineText = (code: string, qty: number, price: unknown) => `${code} × ${Math.abs(qty)}${price !== null && price !== undefined && price !== "" ? ` @ ${Number(price)}` : ""}`;
      if (old) {
        await audit({
          userId: me.id, action: "stock.edit", entityType: "StockDoc", entityId: doc.id, reason: raw.editReason!,
          before: { number, party: old.party, currency: old.currency, rate: old.rate === null ? null : Number(old.rate), total: old.total === null ? null : Number(old.total), discount: old.discount === null ? null : Number(old.discount), reason: old.reason, note: old.note, lines: old.lines.map((l) => lineText(l.product.code, Number(l.qty), l.unitPrice)) },
          after: { number, party, currency: fields.currency, rate: fields.rate, total, discount: fields.discount, reason: fields.reason, note: fields.note, lines: raw.lines.map((l) => lineText(item(l.itemId).code, l.qty, l.unitPrice)) },
        }, tx);
        await notify({
          type: "stock.edited", data: { number, by: me.fullName, reason: raw.editReason! },
          link: `/stock/${doc.id}`, toPermission: "stock:view", exceptUserId: me.id,
        }, tx);
        return { id: doc.id, number, shortages: isIn(t) ? [] : await shortages(ids, tx) };
      }
      await audit({
        userId: me.id, action: `stock.${t.toLowerCase()}`, entityType: "StockDoc", entityId: doc.id, reason: raw.note ?? null,
        after: { number, party, invoice: invoiceNo, ...(t === "BUY" ? { supplierInvoice: raw.supplierRef ?? null, rate: raw.rate ?? null } : {}), currency: raw.currency ?? null, ...(sale ? { subtotal: sale.subtotal, discount: sale.discount, delivery: raw.delivery ?? null } : {}), total, paid: money(t) ? paid : null, reason: raw.reason ?? null, lines: raw.lines.map((l) => `${item(l.itemId).code} × ${l.qty}${l.unitPrice !== undefined && money(t) ? ` @ ${l.unitPrice}` : ""}`) },
      }, tx);
      const short = isIn(t) ? [] : await shortages(ids, tx);
      if (money(t)) {
        // Totals and the customer go only to people who buy, sell or see the safe (M3);
        // everyone else who follows stock gets the same news without the money.
        const moneyIds = (await tx.user.findMany({ where: { active: true, role: { permissions: { some: { permission: { in: MONEY_PERMS } } } } }, select: { id: true } })).map((u) => u.id);
        const viewers = (await tx.user.findMany({ where: { active: true, role: { permissions: { some: { permission: "stock:view" } } } }, select: { id: true } })).map((u) => u.id);
        await notify({
          type: `stock.doc${t}`, data: { number, n: raw.lines.length, party: party ?? "—", total: `${total!.toLocaleString("en", { maximumFractionDigits: 2 })} ${raw.currency}`, by: me.fullName },
          link: `/stock/${doc.id}`, toUserIds: viewers.filter((id) => moneyIds.includes(id)), exceptUserId: me.id,
        }, tx);
        await notify({
          type: `stock.doc${t}Plain`, data: { number, n: raw.lines.length, by: me.fullName },
          link: `/stock/${doc.id}`, toUserIds: viewers.filter((id) => !moneyIds.includes(id)), exceptUserId: me.id,
        }, tx);
      } else {
        await notify({
          type: `stock.doc${t}`, data: { number, n: raw.lines.length, party: party ?? "—", total: "", by: me.fullName },
          link: `/stock/${doc.id}`, toPermission: "stock:view", exceptUserId: me.id,
        }, tx);
      }
      if (short.length) {
        await notify({
          type: "stock.shortage", data: { n: short.length, items: short.slice(0, 5).map((s) => s.code).join(", ") + (short.length > 5 ? "…" : ""), by: me.fullName },
          link: `/stock/${doc.id}`, toPermission: "warehouse:view", exceptUserId: me.id,
        }, tx);
      }
      return { id: doc.id, number, shortages: short };
    }, { timeout: 60_000 });
    for (const p of ["/stock", "/inventory", "/dashboard", "/reports", "/cash"]) revalidatePath(p);
    if (raw.orderId) revalidatePath(`/orders/${raw.orderId}`);
    return result;
  });
}
