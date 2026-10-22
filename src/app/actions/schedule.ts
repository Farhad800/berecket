"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { parseFactoryDateTime } from "@/lib/time";
import { findConflicts, type Conflict } from "@/lib/schedule";
import { recomputeOrderStatus } from "@/lib/orders";

const jobSchema = z.object({
  jobId: z.string().optional(),
  orderLineId: z.string().min(1, "Choose an order line"),
  machineId: z.string().min(1, "Choose a machine"),
  moldId: z.string().optional(),
  plannedQty: z.coerce.number().int("Whole pieces only").positive("Must be more than 0"),
  plannedStart: z.string().min(1, "Required"),
  plannedEnd: z.string().min(1, "Required"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(500).optional(),
  acknowledge: z.string().optional(), // "on" when the planner accepted the warnings
  override: z.string().optional(), // "on" when the planner overrides blocking conflicts
});

export type SaveJobResult = { saved: boolean; jobId?: string; conflicts: Conflict[] };

export async function saveJobAction(_: unknown, fd: FormData) {
  return run<SaveJobResult>(async () => {
    const v = jobSchema.parse(formObject(fd));
    const editing = !!v.jobId;
    const me = await requirePermission(editing ? "schedule:edit" : "schedule:create");

    let start: Date, end: Date;
    try {
      start = parseFactoryDateTime(v.plannedStart);
      end = parseFactoryDateTime(v.plannedEnd);
    } catch {
      throw new UserError("Please enter valid start and finish times.");
    }
    if (end <= start) throw new UserError("Finish must be after start.");

    const line = await db.orderLine.findUniqueOrThrow({ where: { id: v.orderLineId }, include: { order: true } });
    if (["DRAFT", "CANCELLED", "DELIVERED", "ON_HOLD"].includes(line.order.status)) {
      throw new UserError(`Order ${line.order.number} is ${line.order.status.toLowerCase().replace("_", " ")} and can't be scheduled.`);
    }

    const existing = editing ? await db.productionJob.findUniqueOrThrow({ where: { id: v.jobId } }) : null;
    if (existing && ["COMPLETED", "CANCELLED"].includes(existing.status)) throw new UserError("Finished or cancelled jobs can't be rescheduled.");
    if (existing && existing.orderLineId !== v.orderLineId) throw new UserError("A job can't be moved to a different order line.");

    const moved =
      existing &&
      (existing.plannedStart.getTime() !== start.getTime() ||
        existing.plannedEnd.getTime() !== end.getTime() ||
        existing.machineId !== v.machineId ||
        (existing.moldId ?? undefined) !== v.moldId);
    if (moved && (!v.reason || v.reason.length < 3)) throw new UserError("Please give a reason for rescheduling.");

    const conflicts = await findConflicts({
      jobId: v.jobId, orderLineId: v.orderLineId, machineId: v.machineId, moldId: v.moldId ?? null, start, end, plannedQty: v.plannedQty,
    });
    const blocks = conflicts.filter((c) => c.severity === "block");
    const warns = conflicts.filter((c) => c.severity === "warn");
    // Not accepted yet → show the planner what's wrong and save nothing.
    if ((blocks.length && v.override !== "on") || (warns.length && v.acknowledge !== "on")) {
      return { saved: false, conflicts };
    }
    if (blocks.length && (!v.reason || v.reason.length < 3)) {
      throw new UserError("Overriding a machine or mold clash needs a reason.");
    }

    const job = await db.$transaction(async (tx) => {
      const data = {
        machineId: v.machineId,
        moldId: v.moldId ?? null,
        plannedQty: v.plannedQty,
        plannedStart: start,
        plannedEnd: end,
        priority: v.priority ?? line.order.priority,
        notes: v.notes ?? null,
      };
      const j = existing
        ? await tx.productionJob.update({ where: { id: existing.id }, data })
        : await tx.productionJob.create({ data: { ...data, number: await nextNumber("job", tx), orderLineId: v.orderLineId, createdById: me.id } });
      await audit({
        userId: me.id,
        action: existing ? (moved ? "job.reschedule" : "job.update") : "job.create",
        entityType: "ProductionJob",
        entityId: j.id,
        reason: v.reason ?? null,
        before: existing ? { machineId: existing.machineId, moldId: existing.moldId, start: existing.plannedStart.toISOString(), end: existing.plannedEnd.toISOString(), qty: existing.plannedQty } : undefined,
        after: { number: j.number, order: line.order.number, start: start.toISOString(), end: end.toISOString(), qty: v.plannedQty, conflictsAccepted: conflicts.map((c) => c.type) },
      }, tx);
      await recomputeOrderStatus(line.orderId, tx);
      return j;
    });

    revalidatePath("/schedule");
    revalidatePath(`/orders/${line.orderId}`);
    return { saved: true, jobId: job.id, conflicts };
  });
}

export async function cancelJobAction(jobId: string, reason: string) {
  return run(async () => {
    const me = await requirePermission("schedule:edit");
    if (!reason || reason.trim().length < 3) throw new UserError("Please give a reason.");
    const job = await db.productionJob.findUniqueOrThrow({ where: { id: jobId }, include: { orderLine: true, _count: { select: { entries: true } } } });
    if (job.status !== "PLANNED") throw new UserError("Only jobs that haven't started can be cancelled here.");
    if (job._count.entries > 0) throw new UserError("Production has been reported on this job.");
    await db.$transaction(async (tx) => {
      await tx.productionJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
      await audit({ userId: me.id, action: "job.cancel", entityType: "ProductionJob", entityId: jobId, reason: reason.trim() }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
    });
    revalidatePath("/schedule");
    revalidatePath(`/orders/${job.orderLine.orderId}`);
  });
}
