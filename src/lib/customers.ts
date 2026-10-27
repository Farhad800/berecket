import "server-only";
import { db, type Tx } from "./db";
import { CURRENCIES, type Cur } from "./cash";

/**
 * Customer accounts (26–27 Oct 2026; suppliers are customers too). One running balance per customer and currency:
 *   balance = money received from them − money paid to them − sales to them + purchases from them
 * Negative = they owe the factory (printed with −); positive = the factory owes them.
 */
export type Balances = Record<Cur, number>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): Balances => ({ IQD: 0, USD: 0, EUR: 0 });

/** Balances of several customers (all when `ids` is omitted), optionally only up to a moment. */
export async function customerBalances(ids?: string[], opts: { before?: Date; excludeDocId?: string } = {}, tx: Tx = db) {
  const at = opts.before ? { lt: opts.before } : undefined;
  const [sales, money] = await Promise.all([
    tx.stockDoc.groupBy({
      by: ["customerId", "currency", "type"],
      where: { type: { in: ["SELL", "BUY"] }, customerId: ids ? { in: ids } : { not: null }, ...(at ? { createdAt: at } : {}), ...(opts.excludeDocId ? { id: { not: opts.excludeDocId } } : {}) },
      _sum: { total: true },
    }),
    tx.cashEntry.groupBy({
      by: ["customerId", "currency"],
      where: { customerId: ids ? { in: ids } : { not: null }, ...(at ? { createdAt: at } : {}), ...(opts.excludeDocId ? { OR: [{ stockDocId: null }, { stockDocId: { not: opts.excludeDocId } }] } : {}) },
      _sum: { amount: true },
    }),
  ]);
  const out = new Map<string, Balances>();
  const get = (id: string) => out.get(id) ?? (out.set(id, zero()), out.get(id)!);
  for (const s of sales) if (s.customerId && s.currency) get(s.customerId)[s.currency as Cur] += (s.type === "BUY" ? 1 : -1) * Number(s._sum.total ?? 0);
  for (const m of money) if (m.customerId) get(m.customerId)[m.currency as Cur] += Number(m._sum.amount ?? 0);
  for (const b of out.values()) for (const c of CURRENCIES) b[c] = r2(b[c]);
  return out;
}

export async function customerBalance(id: string, opts: { before?: Date; excludeDocId?: string } = {}, tx: Tx = db): Promise<Balances> {
  return (await customerBalances([id], opts, tx)).get(id) ?? zero();
}
