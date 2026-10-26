import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { UserError } from "./action";

/** Each safe keeps every currency apart; nothing is converted unless an exchange is recorded. */
export const CURRENCIES = ["IQD", "USD", "EUR"] as const;
export type Cur = (typeof CURRENCIES)[number];
export type Money = Record<Cur, number>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): Money => ({ IQD: 0, USD: 0, EUR: 0 });
export const MAIN_SAFE = "safe_main";

/** Total money per currency over all safes (SUM of signed amounts). */
export async function balances(tx: Tx = db): Promise<Money> {
  const rows = await tx.cashEntry.groupBy({ by: ["currency"], _sum: { amount: true } });
  const out = zero();
  for (const r of rows) out[r.currency as Cur] = r2(Number(r._sum.amount ?? 0));
  return out;
}

/** Balance per safe and currency. */
export async function safeBalances(tx: Tx = db): Promise<Map<string, Money>> {
  const rows = await tx.cashEntry.groupBy({ by: ["safeId", "currency"], _sum: { amount: true } });
  const out = new Map<string, Money>();
  for (const r of rows) {
    const m = out.get(r.safeId) ?? zero();
    m[r.currency as Cur] = r2(Number(r._sum.amount ?? 0));
    out.set(r.safeId, m);
  }
  return out;
}

export type SafeOpt = { id: string; name: string; currencies: Cur[]; isMain: boolean; balance: Money | null };

/** The safes in their usual order (main first). Balances only for people who may see the safe. */
export async function listSafes(withBalance: boolean, tx: Tx = db): Promise<SafeOpt[]> {
  const [list, bal] = await Promise.all([
    tx.safe.findMany({ orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, currencies: true, isMain: true } }),
    withBalance ? safeBalances(tx) : Promise.resolve(null),
  ]);
  return list.map((s) => ({ ...s, currencies: CURRENCIES.filter((c) => s.currencies.includes(c)), balance: bal ? bal.get(s.id) ?? zero() : null }));
}

/**
 * The safe money goes into / comes out of. A chosen safe must hold that currency; with none chosen
 * (older screens, API) the main safe is used, or else the first safe that holds the currency.
 */
export async function pickSafe(tx: Tx, safeId: string | null | undefined, currency: Cur) {
  if (safeId) {
    const s = await tx.safe.findUnique({ where: { id: safeId }, select: { id: true, name: true, currencies: true } });
    if (!s) throw new UserError("That safe no longer exists. Reload the page.");
    if (!s.currencies.includes(currency)) throw new UserError(`The safe "${s.name}" doesn't hold ${currency}. Choose another safe.`);
    return s;
  }
  const s = await tx.safe.findFirst({ where: { currencies: { has: currency } }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, currencies: true } });
  if (!s) throw new UserError(`No safe holds ${currency}. Add ${currency} to a safe first.`);
  return s;
}

/**
 * Takes money out of one safe inside a transaction. Two people paying from the same safe at the
 * same moment wait for each other (advisory lock per safe and currency), so no safe goes below zero.
 */
export async function takeOut(tx: Tx, safe: { id: string; name: string }, currency: Cur, amount: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cash:" + safe.id + ":" + currency}))`;
  const rows = await tx.$queryRaw<{ s: Prisma.Decimal | null }[]>`SELECT SUM(amount) AS s FROM "CashEntry" WHERE "safeId" = ${safe.id} AND currency = ${currency}::"Currency"`;
  const have = r2(Number(rows[0]?.s ?? 0));
  const f = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 2 });
  if (amount > have + 1e-9) throw new UserError(`"${safe.name}" has only ${f(have)} ${currency}. You can't take out ${f(amount)} ${currency}.`);
}

/** Paid so far for each Buy/Sell document (always a positive number). */
export async function paidFor(docIds: string[], tx: Tx = db) {
  if (docIds.length === 0) return new Map<string, number>();
  const rows = await tx.cashEntry.groupBy({ by: ["stockDocId"], where: { stockDocId: { in: docIds } }, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.stockDocId!, r2(Math.abs(Number(r._sum.amount ?? 0)))]));
}
