import { db, type Tx } from "./db";

const PREFIX = {
  order: "ORD",
  maintenance: "MR",
  service: "SR",
  inspection: "QC",
  issue: "NCR",
  stockInput: "IN",
  stockOutput: "OUT",
  stockBuy: "BUY",
  stockSell: "SAL",
  cashIn: "CIN",
  cashOut: "COUT",
  cashReceive: "RCV",
  cashPay: "PAY",
  cashExchange: "EXC",
  cashTransfer: "TRF",
  salesInvoice: "INV",
  purchaseInvoice: "PUR",
  customer: "C",
  itemLabel: "LBL",
  itemMaterial: "MAT",
  itemPackaging: "PKG",
} as const;

export type DocKind = keyof typeof PREFIX;

/** Kinds numbered without a year: customer codes C-0001, C-0002… */
const NO_YEAR: DocKind[] = ["customer", "itemLabel", "itemMaterial", "itemPackaging"];

/**
 * Atomic, gap-tolerant sequential numbers per kind and year, e.g. ORD-2026-0007.
 * The UPSERT ... RETURNING runs as a single statement, so concurrent requests never collide.
 */
export async function nextNumber(kind: DocKind, tx: Tx = db): Promise<string> {
  const year = new Date().getFullYear();
  const yearly = !NO_YEAR.includes(kind);
  const name = yearly ? `${kind}-${year}` : kind;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("name", "value") VALUES (${name}, 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  const n = String(rows[0].value).padStart(4, "0");
  return yearly ? `${PREFIX[kind]}-${year}-${n}` : `${PREFIX[kind]}-${n}`;
}
