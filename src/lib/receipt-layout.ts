import { z } from "zod";

/** Saved receipt layouts — shared by the editor (browser) and the print page (server). */
export const RECEIPT_FOR = ["SELL", "BUY", "PAYMENT"] as const;
export type ReceiptForType = (typeof RECEIPT_FOR)[number];
export const RECEIPT_LANGS = ["ar", "en", "tr", "ar-en"] as const;
export type ReceiptLang = (typeof RECEIPT_LANGS)[number];
export const COLUMN_KEYS = ["no", "code", "name", "name2", "qty", "unit", "price", "total"] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];
export const FIELD_KEYS = ["date", "time", "number", "invoice", "order", "customer", "phone", "by", "note", "paid", "owed", "words", "signatures"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const settingsSchema = z.object({
  paper: z.enum(["A4", "A5"]).default("A4"),
  margin: z.coerce.number().min(3).max(30).default(10), // mm
  fontSize: z.coerce.number().min(8).max(18).default(11), // pt
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#294680"),
  bannerHeight: z.coerce.number().min(10).max(120).default(40), // mm, the most the banner may take
  title: z.string().max(80).default(""),
  headerText: z.string().max(600).default(""),
  footerText: z.string().max(600).default(""),
  fields: z.partialRecord(z.enum(FIELD_KEYS), z.boolean()).default({}),
  columns: z.array(z.object({ key: z.enum(COLUMN_KEYS), show: z.boolean() })).max(COLUMN_KEYS.length).default([]),
  signatures: z.tuple([z.string().max(40), z.string().max(40)]).default(["", ""]),
  showLogo: z.boolean().default(false),
});
export type ReceiptSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_FIELDS: Record<FieldKey, boolean> = {
  date: true, time: false, number: true, invoice: true, order: true, customer: true, phone: true, by: false, note: true,
  paid: true, owed: true, words: true, signatures: true,
};
export const DEFAULT_COLUMNS: { key: ColumnKey; show: boolean }[] = [
  { key: "no", show: true }, { key: "code", show: false }, { key: "name", show: true }, { key: "name2", show: false },
  { key: "qty", show: true }, { key: "unit", show: false }, { key: "price", show: true }, { key: "total", show: true },
];

/** Fills anything missing (older layouts, new options) so a layout always renders. */
export function normalize(raw: unknown): ReceiptSettings {
  const s = settingsSchema.parse(raw ?? {});
  const cols = [...s.columns.filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i)];
  for (const d of DEFAULT_COLUMNS) if (!cols.some((c) => c.key === d.key)) cols.push({ ...d });
  return { ...s, fields: { ...DEFAULT_FIELDS, ...s.fields }, columns: cols };
}

/** What a receipt prints. Built on the server from a Buy / Sell document or a later payment. */
export type ReceiptData = {
  kind: ReceiptForType;
  number: string;
  date: string; // dd/mm/yyyy in the factory time zone
  time: string; // HH:mm
  invoiceNo: string | null;
  orderNo: string | null;
  party: string | null;
  phone: string | null;
  by: string | null;
  note: string | null;
  currency: "IQD" | "USD" | "EUR";
  lines: { code: string; name: string; name2: string | null; qty: number; unit: string; price: number; total: number }[];
  total: number;
  paid: number;
  owed: number;
  /** Payment receipts: the amount of this payment and the sale it belongs to. */
  payment?: { amount: number; docNumber: string; docTotal: number };
};

export const SAMPLE: ReceiptData = {
  kind: "SELL", number: "SAL-2026-0001", date: "25/10/2026", time: "13:30", invoiceNo: "1001", orderNo: "ORD-2026-0001",
  party: "Al Noor Market", phone: "0750 123 4567", by: "Accountant", note: null, currency: "IQD",
  lines: [
    { code: "0007.5", name: "كاسة بركة 1800", name2: "BEREKET KASE 1800", qty: 1800, unit: "pcs", price: 250, total: 450000 },
    { code: "0012.3", name: "غطاء 28 ملم", name2: "KAPAK 28MM", qty: 5000, unit: "pcs", price: 50, total: 250000 },
  ],
  total: 700000, paid: 500000, owed: 200000,
};
