import "server-only";
import { db, type Tx } from "./db";
import { CURRENCIES, type Cur } from "./cash";

/**
 * Supplier accounts (accountant, 27 Oct 2026). One running balance per supplier and currency:
 *   balance = money paid to the supplier − purchases booked to the supplier
 * Negative = the factory owes the supplier (printed with −); positive = paid in advance.
 * Purchase payments are stored as money out of the safe (negative amounts).
 */
export type Balances = Record<Cur, number>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): Balances => ({ IQD: 0, USD: 0, EUR: 0 });

export async function supplierBalances(ids?: string[], opts: { before?: Date; excludeDocId?: string } = {}, tx: Tx = db) {
  const at = opts.before ? { lt: opts.before } : undefined;
  const [buys, money] = await Promise.all([
    tx.stockDoc.groupBy({
      by: ["supplierId", "currency"],
      where: { type: "BUY", supplierId: ids ? { in: ids } : { not: null }, ...(at ? { createdAt: at } : {}), ...(opts.excludeDocId ? { id: { not: opts.excludeDocId } } : {}) },
      _sum: { total: true },
    }),
    tx.cashEntry.groupBy({
      by: ["supplierId", "currency"],
      where: { supplierId: ids ? { in: ids } : { not: null }, ...(at ? { createdAt: at } : {}), ...(opts.excludeDocId ? { OR: [{ stockDocId: null }, { stockDocId: { not: opts.excludeDocId } }] } : {}) },
      _sum: { amount: true },
    }),
  ]);
  const out = new Map<string, Balances>();
  const get = (id: string) => out.get(id) ?? (out.set(id, zero()), out.get(id)!);
  for (const b of buys) if (b.supplierId && b.currency) get(b.supplierId)[b.currency as Cur] -= Number(b._sum.total ?? 0);
  for (const m of money) if (m.supplierId) get(m.supplierId)[m.currency as Cur] -= Number(m._sum.amount ?? 0); // paid out (−) raises the balance
  for (const b of out.values()) for (const c of CURRENCIES) b[c] = r2(b[c]);
  return out;
}

export async function supplierBalance(id: string, opts: { before?: Date; excludeDocId?: string } = {}, tx: Tx = db): Promise<Balances> {
  return (await supplierBalances([id], opts, tx)).get(id) ?? zero();
}
