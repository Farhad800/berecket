import "server-only";
import { randomUUID } from "crypto";
import type { StockState } from "@prisma/client";
import { db, type Tx } from "./db";

export type Balances = Record<StockState, number>;
const ZERO = (): Balances => ({ AVAILABLE: 0, RESERVED: 0, QUARANTINE: 0, REJECTED: 0, SHIPPED: 0 });

/** Stock per state for each batch — always the SUM of ledger movements, never a stored total. */
export async function getBatchBalances(batchIds: string[], tx: Tx = db): Promise<Map<string, Balances>> {
  const map = new Map<string, Balances>();
  if (!batchIds.length) return map;
  const rows = await tx.stockMovement.groupBy({ by: ["batchId", "state"], where: { batchId: { in: batchIds } }, _sum: { qty: true } });
  for (const id of batchIds) map.set(id, ZERO());
  for (const r of rows) map.get(r.batchId)![r.state] = r._sum.qty ?? 0;
  return map;
}

/**
 * Keeps warehouse stock in line with the batch's quality decision:
 *  PENDING / HOLD → everything on hand goes to QUARANTINE (reservations are cancelled)
 *  REJECTED       → everything on hand goes to REJECTED
 *  PARTIAL        → rejected and held pieces from the latest inspection are blocked, the rest stays available
 *  RELEASED / APPROVED → blocked stock returns to AVAILABLE
 * Writes balancing movements (net zero) so every change is traceable. No-op if nothing was received.
 */
export async function syncBatchStock(batchId: string, userId: string, reason: string, tx: Tx) {
  const batch = await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
  const cur = (await getBatchBalances([batchId], tx)).get(batchId)!;
  const onHand = cur.AVAILABLE + cur.RESERVED + cur.QUARANTINE + cur.REJECTED;
  if (onHand <= 0) return { changed: false, cancelledReservations: 0 };

  const want: Balances = { ...cur };
  switch (batch.qcStatus) {
    case "PENDING":
    case "HOLD":
      want.REJECTED = cur.REJECTED;
      want.QUARANTINE = onHand - cur.REJECTED;
      want.AVAILABLE = 0;
      want.RESERVED = 0;
      break;
    case "REJECTED":
      want.REJECTED = onHand;
      want.QUARANTINE = want.AVAILABLE = want.RESERVED = 0;
      break;
    case "PARTIAL": {
      const insp = await tx.qcInspection.findFirst({ where: { batchId }, orderBy: { inspectedAt: "desc" } });
      const rej = Math.min(insp?.qtyRejected ?? 0, onHand);
      const hold = Math.min(insp?.qtyHold ?? 0, onHand - rej);
      const free = onHand - rej - hold;
      want.REJECTED = rej;
      want.QUARANTINE = hold;
      want.RESERVED = Math.min(cur.RESERVED, free);
      want.AVAILABLE = free - want.RESERVED;
      break;
    }
    case "RELEASED":
    case "APPROVED":
      want.REJECTED = 0;
      want.QUARANTINE = 0;
      want.RESERVED = cur.RESERVED;
      want.AVAILABLE = onHand - cur.RESERVED;
      break;
  }

  const states: StockState[] = ["AVAILABLE", "RESERVED", "QUARANTINE", "REJECTED"];
  const deltas = states.map((s) => [s, want[s] - cur[s]] as const).filter(([, d]) => d !== 0);
  if (!deltas.length) return { changed: false, cancelledReservations: 0 };

  const transactionId = randomUUID();
  await tx.stockMovement.createMany({
    data: deltas.map(([state, qty]) => ({
      transactionId, type: "QC_SYNC", productId: batch.productId, batchId, orderLineId: batch.orderLineId,
      state, qty, reason, referenceType: "Batch", referenceId: batchId, createdById: userId,
    })),
  });
  return { changed: true, cancelledReservations: Math.max(cur.RESERVED - want.RESERVED, 0) };
}
