import "server-only";
import { db, type Tx } from "./db";

export type Conflict = {
  type:
    | "MACHINE_OVERLAP"
    | "MOLD_OVERLAP"
    | "MACHINE_UNAVAILABLE"
    | "MAINTENANCE_OPEN"
    | "MOLD_UNAVAILABLE"
    | "MOLD_PRODUCT_MISMATCH"
    | "DEADLINE"
    | "CAPACITY"
    | "OVER_PLANNED";
  /** "block" needs an explicit override with a reason; "warn" needs acknowledgement. */
  severity: "block" | "warn";
  params: Record<string, string | number>;
};

const ACTIVE_JOB = ["PLANNED", "IN_PROGRESS", "PAUSED"] as const;

/**
 * Everything that makes a proposed job risky or impossible. The planner sees these
 * before saving — the system never silently accepts an impossible schedule.
 */
export async function findConflicts(
  p: { jobId?: string; orderLineId: string; machineId: string; moldId?: string | null; start: Date; end: Date; plannedQty: number },
  tx: Tx = db,
): Promise<Conflict[]> {
  const out: Conflict[] = [];
  const overlap = { plannedStart: { lt: p.end }, plannedEnd: { gt: p.start } };
  const notSelf = p.jobId ? { id: { not: p.jobId } } : {};

  const [line, machine, mold, machineJobs, moldJobs, openMaint, otherPlanned] = await Promise.all([
    tx.orderLine.findUniqueOrThrow({ where: { id: p.orderLineId }, include: { order: true, product: true } }),
    tx.machine.findUniqueOrThrow({ where: { id: p.machineId } }),
    p.moldId ? tx.mold.findUnique({ where: { id: p.moldId } }) : null,
    tx.productionJob.findMany({ where: { ...notSelf, machineId: p.machineId, status: { in: [...ACTIVE_JOB] }, ...overlap }, select: { number: true } }),
    p.moldId
      ? tx.productionJob.findMany({ where: { ...notSelf, moldId: p.moldId, status: { in: [...ACTIVE_JOB] }, ...overlap }, select: { number: true, machine: { select: { code: true } } } })
      : [],
    tx.maintenanceRequest.findMany({
      where: { machineId: p.machineId, machineDown: true, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } },
      select: { number: true },
    }),
    tx.productionJob.aggregate({ _sum: { plannedQty: true }, where: { ...notSelf, orderLineId: p.orderLineId, status: { not: "CANCELLED" } } }),
  ]);

  for (const j of machineJobs) out.push({ type: "MACHINE_OVERLAP", severity: "block", params: { job: j.number, machine: machine.code } });
  for (const j of moldJobs) out.push({ type: "MOLD_OVERLAP", severity: "block", params: { job: j.number, mold: mold!.code, machine: j.machine?.code ?? "—" } });

  if (["DOWN", "MAINTENANCE", "RETIRED"].includes(machine.status) || machine.archivedAt) {
    out.push({ type: "MACHINE_UNAVAILABLE", severity: machine.status === "RETIRED" || machine.archivedAt ? "block" : "warn", params: { machine: machine.code, status: machine.status } });
  }
  for (const m of openMaint) out.push({ type: "MAINTENANCE_OPEN", severity: "warn", params: { request: m.number, machine: machine.code } });

  if (mold) {
    if (["IN_REPAIR", "RETIRED"].includes(mold.status) || mold.archivedAt) {
      out.push({ type: "MOLD_UNAVAILABLE", severity: mold.status === "RETIRED" || mold.archivedAt ? "block" : "warn", params: { mold: mold.code, status: mold.status } });
    }
    if (mold.productId && mold.productId !== line.productId) {
      out.push({ type: "MOLD_PRODUCT_MISMATCH", severity: "warn", params: { mold: mold.code, product: line.product.code } });
    }
  }

  // The order is due by the END of its requested day.
  const dueBy = new Date(line.order.requestedDeliveryDate.getTime() + 86_400_000);
  if (p.end > dueBy) out.push({ type: "DEADLINE", severity: "warn", params: { order: line.order.number } });

  // Capacity: pieces per hour from cycle time and cavities, when both are known.
  const cycle = line.product.cycleTimeSec ? Number(line.product.cycleTimeSec) : 0;
  const cavities = mold?.cavities ?? 0;
  if (cycle > 0 && cavities > 0) {
    const neededHours = (p.plannedQty * cycle) / cavities / 3600;
    const windowHours = (p.end.getTime() - p.start.getTime()) / 3_600_000;
    if (neededHours > windowHours) {
      out.push({ type: "CAPACITY", severity: "warn", params: { needed: Math.ceil(neededHours * 10) / 10, available: Math.round(windowHours * 10) / 10 } });
    }
  }

  const plannedTotal = (otherPlanned._sum.plannedQty ?? 0) + p.plannedQty;
  if (plannedTotal > line.quantity) {
    out.push({ type: "OVER_PLANNED", severity: "warn", params: { planned: plannedTotal, ordered: line.quantity } });
  }
  return out;
}

/** Hours needed at 100% efficiency, or null when cycle time / cavities aren't known. */
export function estimateHours(qty: number, cycleSec: number | null, cavities: number | null) {
  if (!cycleSec || !cavities) return null;
  return (qty * cycleSec) / cavities / 3600;
}
