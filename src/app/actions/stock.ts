"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { MONEY_PERMS, requirePermission } from "@/lib/auth";
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
 * supplier/customer, invoice number; a sale can be linked to an order). Production and what it
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
  /** Sell: the customer account, where the goods go, and a discount on the whole invoice. */
  customerId: z.string().max(40).optional(),
  delivery: z.string().trim().max(300).optional(),
  discount,
  note: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({
    itemId: z.string().min(1, "Choose the item").max(40),
    qty: z.coerce.number().positive("Quantity must be more than 0").max(50_000_000),
    unitPrice: z.coerce.number().min(0, "Price can't be negative").max(1_000_000_000)
      .refine((n) => maxDecimals(n, PRICE_DECIMALS), `A price can have at most ${PRICE_DECIMALS} decimals`).optional(),
    discount,
  })).min(1, "Add at least one item").max(500, "At most 500 lines"),
});

export type DocResult = { id: string; number: string; shortages: Shortage[] };

export async function saveStockDocAction(input: unknown) {
  return run(async (): Promise<DocResult> => {
    const raw = schema.parse(input);
    const me = await requirePermission(PERM[raw.type]);
    const t = raw.type;
    if (!money(t) && !raw.reason) throw new UserError("Choose the reason.");
    if (t === "SELL" && !raw.customerId) throw new UserError("Choose the customer.");
    if (t !== "SELL" && (raw.discount || raw.lines.some((l) => l.discount?.value))) throw new UserError("Discounts are only for sales.");
    if (money(t)) {
      if (t === "BUY" && !raw.party) throw new UserError("Type the supplier's name.");
      if (!raw.currency) throw new UserError("Choose the currency (IQD, USD or EUR).");
      if (raw.lines.some((l) => l.unitPrice === undefined)) throw new UserError("Enter the price for every line.");
    }
    if (raw.orderId && t !== "SELL") throw new UserError("Only a sale can be linked to an order.");
    const ids = raw.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw new UserError("The same item is on two lines. Put it on one line.");

    // Sell: line discounts, then the invoice discount (one rule shared with the form and the receipt).
    const sale = t === "SELL" ? saleTotals(raw.lines.map((l) => ({ qty: l.qty, price: l.unitPrice ?? 0, discount: l.discount })), raw.discount) : null;
    if (sale) {
      raw.lines.forEach((l, i) => { const p = discountProblem(sale.lines[i].gross, l.discount); if (p) throw new UserError(`Line ${i + 1}: ${p}`); });
      const p = discountProblem(sale.subtotal, raw.discount); if (p) throw new UserError(`Invoice discount: ${p}`);
    }
    const total = sale ? sale.total : money(t) ? docTotal(raw.lines.map((l) => ({ qty: l.qty, price: l.unitPrice ?? 0 }))) : null;
    const paid = money(t) ? Math.round((raw.paid ?? 0) * 100) / 100 : 0;
    if (total !== null && paid > total + 1e-9) throw new UserError("Paid now can't be more than the total.");

    const result = await db.$transaction(async (tx) => {
      const items = await tx.product.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, code: true, unit: true } });
      if (items.length !== ids.length) throw new UserError("One of the items no longer exists. Reload the page.");
      const item = (id: string) => items.find((i) => i.id === id)!;
      for (const l of raw.lines) {
        const it = item(l.itemId);
        if (it.unit.toLowerCase() !== "kg" && !Number.isInteger(l.qty)) throw new UserError(`${it.code} is counted in pieces — whole numbers only.`);
        // Tolerant check: 1.001 × 1000 is 1000.9999… in floating point, which a strict comparison refused.
        if (it.unit.toLowerCase() === "kg" && !maxDecimals(l.qty, 3)) throw new UserError(`${it.code}: at most 3 decimals.`);
      }
      if (raw.orderId && !(await tx.order.count({ where: { id: raw.orderId } }))) throw new UserError("That order no longer exists.");
      // Sell: booked to a customer account; the name/phone are copied so the document keeps them as they were.
      let party = raw.party || null, phone = money(t) ? raw.phone || null : null, invoiceNo = raw.invoiceNo || null;
      if (t === "SELL") {
        const c = await tx.customer.findFirst({ where: { id: raw.customerId, archivedAt: null } });
        if (!c) throw new UserError("That customer no longer exists. Reload the page.");
        party = c.name; phone = raw.phone || c.phone;
        invoiceNo = await nextNumber("salesInvoice", tx); // automatic invoice number (INV-2026-0001)
      }
      const number = await nextNumber(NUM[t], tx);
      const doc = await tx.stockDoc.create({
        data: {
          number, type: t, reason: money(t) ? null : raw.reason!, party, phone, invoiceNo,
          currency: money(t) ? raw.currency! : null, orderId: raw.orderId || null, note: raw.note || null, total, createdById: me.id,
          ...(sale ? {
            customerId: raw.customerId!, delivery: raw.delivery || null, subtotal: sale.subtotal,
            discountKind: raw.discount?.value ? raw.discount.kind : null, discountValue: raw.discount?.value ? raw.discount.value : null, discount: sale.discount || null,
          } : {}),
        },
      });
      await tx.stockMovement.createMany({
        data: raw.lines.map((l, i) => ({
          productId: l.itemId, type: t, qty: isIn(t) ? l.qty : -l.qty, docId: doc.id, reference: number,
          unitPrice: money(t) ? l.unitPrice! : null, reason: raw.note || null, createdById: me.id,
          ...(sale && l.discount?.value ? { discountKind: l.discount.kind, discountValue: l.discount.value, discount: sale.lines[i].discount } : {}),
        })),
      });
      if (paid > 0) {
        const safe = await pickSafe(tx, raw.safeId, raw.currency as Cur);
        if (t === "BUY") await takeOut(tx, safe, raw.currency as Cur, paid);
        await tx.cashEntry.create({
          data: { number: await nextNumber(t === "SELL" ? "cashReceive" : "cashPay", tx), kind: t === "SELL" ? "SALE" : "PURCHASE", safeId: safe.id, currency: raw.currency!,
            amount: t === "SELL" ? paid : -paid, stockDocId: doc.id, customerId: t === "SELL" ? raw.customerId! : null, party, createdById: me.id },
        });
      }
      await audit({
        userId: me.id, action: `stock.${t.toLowerCase()}`, entityType: "StockDoc", entityId: doc.id, reason: raw.note ?? null,
        after: { number, party, invoice: invoiceNo, currency: raw.currency ?? null, ...(sale ? { subtotal: sale.subtotal, discount: sale.discount, delivery: raw.delivery ?? null } : {}), total, paid: money(t) ? paid : null, reason: raw.reason ?? null, lines: raw.lines.map((l) => `${item(l.itemId).code} × ${l.qty}${l.unitPrice !== undefined && money(t) ? ` @ ${l.unitPrice}` : ""}`) },
      }, tx);
      const short = isIn(t) ? [] : await shortages(ids, tx);
      if (money(t)) {
        // Totals and the supplier/customer go only to people who buy, sell or see the safe (M3);
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
