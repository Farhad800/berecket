import { db, type Tx } from "./db";

const PREFIX = {
  order: "ORD",
  job: "JOB",
  batch: "LOT",
  maintenance: "MR",
  service: "SR",
  inspection: "QC",
  issue: "NCR",
  receipt: "GRN",
  shipment: "SHP",
} as const;

export type DocKind = keyof typeof PREFIX;

/**
 * Atomic, gap-tolerant sequential numbers per kind and year, e.g. ORD-2026-0007.
 * The UPSERT ... RETURNING runs as a single statement, so concurrent requests never collide.
 */
export async function nextNumber(kind: DocKind, tx: Tx = db): Promise<string> {
  const year = new Date().getFullYear();
  const name = `${kind}-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("name", "value") VALUES (${name}, 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${PREFIX[kind]}-${year}-${String(rows[0].value).padStart(4, "0")}`;
}
