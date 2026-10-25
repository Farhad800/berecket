import "server-only";
import { db } from "./db";
import { FACTORY_TZ } from "./time";
import type { ReceiptData } from "./receipt-layout";
import { docTotal, lineTotal } from "./money";

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
    include: { order: { select: { number: true } }, payments: { select: { amount: true } }, lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { code: true, name: true, name2: true, unit: true } } } } },
  });
  if (!d || (d.type !== "BUY" && d.type !== "SELL") || !d.currency) return null;
  const by = await db.user.findUnique({ where: { id: d.createdById }, select: { fullName: true } });
  const lines = d.lines.map((l) => {
    const qty = Math.abs(Number(l.qty)), price = Number(l.unitPrice ?? 0);
    return { code: l.product.code, name: l.product.name, name2: l.product.name2, qty, unit: l.product.unit, price, total: lineTotal(qty, price) };
  });
  const total = d.total !== null ? Number(d.total) : docTotal(lines);
  const paid = r2(d.payments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0));
  return {
    kind: d.type, number: d.number, ...stamp(d.createdAt), invoiceNo: d.invoiceNo, orderNo: d.order?.number ?? null, party: d.party, phone: d.phone,
    by: by?.fullName ?? null, note: d.note, currency: d.currency, lines, total, paid, owed: r2(Math.max(total - paid, 0)),
  };
}

/** A payment received later for a sale (RCV): this payment, the sale, paid so far and still owed after it. */
export async function paymentReceipt(cashId: string): Promise<ReceiptData | null> {
  const e = await db.cashEntry.findUnique({ where: { id: cashId }, include: { stockDoc: { include: { order: { select: { number: true } }, payments: { select: { amount: true, createdAt: true, id: true } } } } } });
  if (!e || e.kind !== "SALE" || !e.stockDoc) return null;
  const doc = e.stockDoc;
  const by = await db.user.findUnique({ where: { id: e.createdById }, select: { fullName: true } });
  // Paid up to and including this payment (a reprint later shows the same numbers).
  const upto = doc.payments.filter((p) => p.createdAt < e.createdAt || p.id === e.id);
  const paid = r2(upto.reduce((s, p) => s + Math.abs(Number(p.amount)), 0));
  const total = Number(doc.total ?? 0);
  return {
    kind: "PAYMENT", number: e.number, ...stamp(e.createdAt), invoiceNo: doc.invoiceNo, orderNo: doc.order?.number ?? null, party: doc.party, phone: doc.phone,
    by: by?.fullName ?? null, note: e.note, currency: e.currency, lines: [], total, paid, owed: r2(Math.max(total - paid, 0)),
    payment: { amount: r2(Math.abs(Number(e.amount))), docNumber: doc.number, docTotal: total },
  };
}
