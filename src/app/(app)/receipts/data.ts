import "server-only";
import { db } from "@/lib/db";
import { docReceipt, paymentReceipt } from "@/lib/receipt-data";
import { normalize, type ReceiptData, type ReceiptForType, type ReceiptLang } from "@/lib/receipt-layout";
import type { LayoutRow } from "./layout-editor";

/** Latest real Sell / Buy / payment, so the preview shows the factory's own data. */
export async function previewSamples(): Promise<Partial<Record<ReceiptForType, ReceiptData>>> {
  const [sell, buy, pay] = await Promise.all([
    db.stockDoc.findFirst({ where: { type: "SELL" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.stockDoc.findFirst({ where: { type: "BUY" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.cashEntry.findFirst({ where: { kind: "SALE" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  const out: Partial<Record<ReceiptForType, ReceiptData>> = {};
  if (sell) out.SELL = (await docReceipt(sell.id)) ?? undefined;
  if (buy) out.BUY = (await docReceipt(buy.id)) ?? undefined;
  if (pay) out.PAYMENT = (await paymentReceipt(pay.id)) ?? undefined;
  return out;
}

export function toRow(l: { id: string; name: string; docType: ReceiptForType; language: string; isDefault: boolean; banner: string | null; settings: unknown }): LayoutRow {
  return { id: l.id, name: l.name, docType: l.docType, language: l.language as ReceiptLang, isDefault: l.isDefault, banner: l.banner, settings: normalize(l.settings) };
}
