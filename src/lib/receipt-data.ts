import "server-only";
import { db } from "./db";
import { FACTORY_TZ } from "./time";
import type { ReceiptData } from "./receipt-layout";
import { docTotal, lineTotal } from "./money";
import { customerBalance } from "./customers";
const pctLabel = (kind: string | null, v: unknown) => (kind === "PERCENT" && v !== null ? `${Number(v)}%` : undefined);
/** Payments made together with the sale (same save) count as "paid now" on its receipt. */
const SAME_SAVE_MS = 10_000;

const r2 = (n: number) => Math.round(n * 100) / 100;
function stamp(d: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: FACTORY_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.day}/${parts.month}/${parts.year}`, time: `${parts.hour}:${parts.minute}` };
}

/** Everything a Buy / Sell receipt prints. Null when the document isn't a Buy or Sell. */
export async function docReceipt(id: string): Promise<ReceiptData | null> {
  const d = await db.stockDoc.findUnique({
    where: { id },
    include: { order: { select: { number: true } }, customer: { select: { code: true } }, payments: { select: { amount: true, createdAt: true } }, lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { code: true, name: true, name2: true, unit: true } } } } },
  });
  if (!d || (d.type !== "BUY" && d.type !== "SELL") || !d.currency) return null;
  const by = await db.user.findUnique({ where: { id: d.createdById }, select: { fullName: true } });
  const lines = d.lines.map((l) => {
    const qty = Math.abs(Number(l.qty)), price = Number(l.unitPrice ?? 0);
    const discount = Number(l.discount ?? 0);
    return { code: l.product.code, name: l.product.name, name2: l.product.name2, qty, unit: l.product.unit, price, discount, discountLabel: pctLabel(l.discountKind, l.discountValue), total: r2(lineTotal(qty, price) - discount) };
  });
  const total = d.total !== null ? Number(d.total) : docTotal(lines);
  const paid = r2(d.payments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0));
  // Customer account: balance just before this sale, what was paid with it, and the balance after it.
  // Fixed at the moment of the sale, so a reprint later shows the same numbers.
  let balance: ReceiptData["balance"];
  if (d.type === "SELL" && d.customerId) {
    const before = (await customerBalance(d.customerId, { before: d.createdAt, excludeDocId: d.id }))[d.currency];
    const paidNow = r2(d.payments.filter((p) => p.createdAt.getTime() - d.createdAt.getTime() < SAME_SAVE_MS).reduce((s, p) => s + Number(p.amount), 0));
    balance = { before, paidNow, after: r2(before - total + paidNow) };
  }
  // Bought from a customer: the purchase raises their balance (+ = the factory owes them), money paid to them lowers it.
  if (d.type === "BUY" && d.customerId) {
    const before = (await customerBalance(d.customerId, { before: d.createdAt, excludeDocId: d.id }))[d.currency];
    const paidNow = r2(d.payments.filter((p) => p.createdAt.getTime() - d.createdAt.getTime() < SAME_SAVE_MS).reduce((s, p) => s + Math.abs(Number(p.amount)), 0));
    balance = { before, paidNow, after: r2(before + total - paidNow) };
  }
  return {
    kind: d.type, number: d.number, ...stamp(d.createdAt), invoiceNo: d.invoiceNo, orderNo: d.order?.number ?? null, party: d.party, phone: d.phone,
    by: by?.fullName ?? null, note: d.note, currency: d.currency, lines, total, paid, owed: r2(Math.max(total - paid, 0)),
    customerCode: d.customer?.code ?? null, delivery: d.delivery, supplierRef: d.supplierRef,
    ...(d.discount !== null && Number(d.discount) > 0 ? { subtotal: Number(d.subtotal), discount: Number(d.discount), discountLabel: pctLabel(d.discountKind, d.discountValue) } : {}),
    balance,
  };
}

/** A payment received later for a sale (RCV): this payment, the sale, paid so far and still owed after it. */
export async function paymentReceipt(cashId: string): Promise<ReceiptData | null> {
  const e = await db.cashEntry.findUnique({ where: { id: cashId }, include: { customer: { select: { code: true, name: true, phone: true } }, stockDoc: { include: { order: { select: { number: true } }, payments: { select: { amount: true, createdAt: true, id: true } } } } } });
  if (!e || e.kind !== "SALE" || (!e.stockDoc && !e.customerId)) return null;
  const by = await db.user.findUnique({ where: { id: e.createdById }, select: { fullName: true } });
  const amount = r2(Math.abs(Number(e.amount)));
  // Customer account: balance before this payment and after it.
  const balance = e.customerId ? await (async () => {
    const before = (await customerBalance(e.customerId!, { before: e.createdAt }))[e.currency];
    return { before, paidNow: amount, after: r2(before + amount) };
  })() : undefined;
  if (!e.stockDoc) {
    // Money received on the customer's account (not for one invoice).
    return {
      kind: "PAYMENT", number: e.number, ...stamp(e.createdAt), invoiceNo: null, orderNo: null, party: e.customer?.name ?? e.party, phone: e.customer?.phone ?? null,
      by: by?.fullName ?? null, note: e.note, currency: e.currency, lines: [], total: 0, paid: amount, owed: 0, customerCode: e.customer?.code ?? null,
      payment: { amount, docNumber: null, docTotal: null }, balance,
    };
  }
  const doc = e.stockDoc;
  // Paid up to and including this payment (a reprint later shows the same numbers).
  const upto = doc.payments.filter((p) => p.createdAt < e.createdAt || p.id === e.id);
  const paid = r2(upto.reduce((s, p) => s + Math.abs(Number(p.amount)), 0));
  const total = Number(doc.total ?? 0);
  return {
    kind: "PAYMENT", number: e.number, ...stamp(e.createdAt), invoiceNo: doc.invoiceNo, orderNo: doc.order?.number ?? null, party: doc.party, phone: doc.phone,
    by: by?.fullName ?? null, note: e.note, currency: e.currency, lines: [], total, paid, owed: r2(Math.max(total - paid, 0)),
    payment: { amount, docNumber: doc.number, docTotal: total }, customerCode: e.customer?.code ?? null, balance,
  };
}
