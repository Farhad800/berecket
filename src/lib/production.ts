import "server-only";
import type { Shift } from "@prisma/client";
import { db, type Tx } from "./db";
import { nextNumber } from "./numbering";

/** Machine status follows reality: RUNNING while a job runs, otherwise AVAILABLE — unless Service has it DOWN/in MAINTENANCE. */
export async function syncMachineStatus(machineId: string | null | undefined, tx: Tx = db) {
  if (!machineId) return;
  const m = await tx.machine.findUnique({ where: { id: machineId } });
  if (!m || ["DOWN", "MAINTENANCE", "RETIRED"].includes(m.status)) return;
  const running = await tx.productionJob.count({ where: { machineId, status: "IN_PROGRESS" } });
  const status = running > 0 ? "RUNNING" : "AVAILABLE";
  if (m.status !== status) await tx.machine.update({ where: { id: machineId }, data: { status } });
}

/** The batch currently receiving quantities for a job; opens one if needed. */
export async function ensureOpenBatch(jobId: string, shift: Shift, userId: string, tx: Tx) {
  const open = await tx.batch.findFirst({ where: { jobId, closedAt: null }, orderBy: { createdAt: "desc" } });
  if (open) return open;
  const job = await tx.productionJob.findUniqueOrThrow({ where: { id: jobId }, include: { orderLine: { include: { product: true } } } });
  return tx.batch.create({
    data: {
      number: await nextNumber("batch", tx),
      jobId,
      orderLineId: job.orderLineId,
      productId: job.orderLine.productId,
      shift,
      // Factory policy: batches are shippable by default and QC samples randomly —
      // except products flagged "inspection required", which wait for QC.
      qcStatus: job.orderLine.product.qcRequired ? "PENDING" : "RELEASED",
      createdById: userId,
    },
  });
}

export type JobTotals = { good: number; defective: number; downtimeMin: number };

/** Produced/defective totals and downtime minutes per job — always summed from the log. */
export async function getJobTotals(jobIds: string[], tx: Tx = db): Promise<Map<string, JobTotals>> {
  const map = new Map<string, JobTotals>();
  if (!jobIds.length) return map;
  const [entries, downs] = await Promise.all([
    tx.productionEntry.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _sum: { qtyGood: true, qtyDefective: true } }),
    tx.downtime.findMany({ where: { jobId: { in: jobIds } }, select: { jobId: true, startedAt: true, endedAt: true } }),
  ]);
  for (const id of jobIds) map.set(id, { good: 0, defective: 0, downtimeMin: 0 });
  for (const e of entries) map.set(e.jobId, { ...map.get(e.jobId)!, good: e._sum.qtyGood ?? 0, defective: e._sum.qtyDefective ?? 0 });
  const now = Date.now();
  for (const d of downs) {
    if (!d.jobId) continue;
    const t = map.get(d.jobId)!;
    t.downtimeMin += Math.round(((d.endedAt?.getTime() ?? now) - d.startedAt.getTime()) / 60000);
  }
  return map;
}

export const DOWNTIME_CATEGORIES = ["BREAKDOWN", "MOLD_CHANGE", "MOLD_PROBLEM", "MATERIAL", "POWER", "QUALITY", "NO_OPERATOR", "SETUP", "OTHER"] as const;
