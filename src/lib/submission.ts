import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { UserError } from "./action";

/**
 * Applies a form submission once (code review M2, 26 Oct 2026).
 *
 * The browser sends a fresh `submissionId` with each save and keeps it until the save succeeds.
 * The id is written in the SAME transaction as the save:
 *  - a second copy arriving at the same moment waits on the first, then gets its result back;
 *  - a copy arriving later (network retry, double-click) gets the stored result back;
 *  - if the save fails, the transaction rolls back and the id is not kept, so it can be retried.
 * Without an id (older pages, scripts) the save simply runs as before.
 */
const ID = /^[A-Za-z0-9-]{16,64}$/;
const KEEP_DAYS = 30;
class Duplicate extends Error {}

export function submissionKey(raw: unknown): string | null {
  return typeof raw === "string" && ID.test(raw) ? raw : null;
}

async function previous<T>(key: string, userId: string, action: string): Promise<T | null> {
  const row = await db.submissionKey.findUnique({ where: { key } });
  if (!row) return null;
  if (row.userId !== userId || row.action !== action) throw new UserError("This form was already used. Reload the page and try again.");
  return (row.result ?? null) as T | null;
}

export async function once<T>(
  key: string | null,
  userId: string,
  action: string,
  work: (tx: Tx) => Promise<T>,
  opts: { timeout?: number } = {},
): Promise<{ result: T; duplicate: boolean }> {
  if (!key) return { result: await db.$transaction(work, { timeout: opts.timeout ?? 60_000 }), duplicate: false };
  const done = await previous<T>(key, userId, action);
  if (done !== null) return { result: done, duplicate: true };
  try {
    const result = await db.$transaction(async (tx) => {
      try {
        // First statement: a second copy of the same submission waits here until the first commits or rolls back.
        await tx.submissionKey.create({ data: { key, userId, action } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new Duplicate();
        throw e;
      }
      const r = await work(tx);
      await tx.submissionKey.update({ where: { key }, data: { result: (r ?? null) as Prisma.InputJsonValue } });
      return r;
    }, { timeout: opts.timeout ?? 60_000 });
    void db.submissionKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } }).catch(() => {});
    return { result, duplicate: false };
  } catch (e) {
    if (e instanceof Duplicate) {
      const r = await previous<T>(key, userId, action);
      if (r !== null) return { result: r, duplicate: true };
      throw new UserError("This was already saved. Reload the page to see it.");
    }
    throw e;
  }
}

/** Holds one production entry until the transaction ends (corrections, QC). Returns false if it no longer exists. */
export async function lockEntry(tx: Tx, entryId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProductionEntry" WHERE id = ${entryId} FOR UPDATE`;
  return rows.length > 0;
}

/**
 * Holds one product + day + shift while its entry is found or created, so two people saving the same
 * product at the same moment end up in ONE entry. Other products, shifts and days are not held up.
 */
export async function lockEntrySlot(tx: Tx, day: string, shift: string, productId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entry:${day}:${shift}:${productId}`}))`;
}
