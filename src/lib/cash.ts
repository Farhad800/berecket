import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { UserError } from "./action";

/** The safe keeps every currency apart; nothing is converted unless an exchange is recorded. */
export const CURRENCIES = ["IQD", "USD", "EUR"] as const;
export type Cur = (typeof CURRENCIES)[number];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Balance of the safe per currency (SUM of signed amounts). */
export async function balances(tx: Tx = db): Promise<Record<Cur, number>> {
  const rows = await tx.cashEntry.groupBy({ by: ["currency"], _sum: { amount: true } });
  const out = { IQD: 0, USD: 0, EUR: 0 } as Record<Cur, number>;
  for (const r of rows) out[r.currency as Cur] = r2(Number(r._sum.amount ?? 0));
  return out;
}

/**
 * Takes money out of the safe inside a transaction. Two people paying at the same moment wait
 * for each other (advisory lock per currency), so the safe can never go below zero.
 */
export async function takeOut(tx: Tx, currency: Cur, amount: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cash:" + currency}))`;
  const rows = await tx.$queryRaw<{ s: Prisma.Decimal | null }[]>`SELECT SUM(amount) AS s FROM "CashEntry" WHERE currency = ${currency}::"Currency"`;
  const have = r2(Number(rows[0]?.s ?? 0));
  if (amount > have + 1e-9) throw new UserError(`The safe has only ${have.toLocaleString("en", { maximumFractionDigits: 2 })} ${currency}. You can't take out ${amount.toLocaleString("en", { maximumFractionDigits: 2 })} ${currency}.`);
}

/** Paid so far for each Buy/Sell document (always a positive number). */
export async function paidFor(docIds: string[], tx: Tx = db) {
  if (docIds.length === 0) return new Map<string, number>();
  const rows = await tx.cashEntry.groupBy({ by: ["stockDocId"], where: { stockDocId: { in: docIds } }, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.stockDocId!, r2(Math.abs(Number(r._sum.amount ?? 0)))]));
}
