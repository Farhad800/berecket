"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { currentShift, parseFactoryDateTime } from "@/lib/time";
import { recomputeOrderStatus } from "@/lib/orders";
import { DOWNTIME_CATEGORIES, ensureOpenBatch, syncMachineStatus } from "@/lib/production";
import { notify } from "@/lib/notify";

const shiftEnum = z.enum(["A", "B", "C"]);

async function loadJob(jobId: string, tx: Tx) {
  const job = await tx.productionJob.findUnique({
    where: { id: jobId },
    include: { orderLine: { include: { order: true, product: true } }, mold: true, machine: true },
  });
  if (!job) throw new UserError("Job not found.");
  return job;
}

function refresh(jobId: string, orderId: string) {
  revalidatePath(`/production/${jobId}`);
  revalidatePath("/production");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

// ───────── Start ─────────
export async function startJobAction(jobId: string) {
  return run(async () => {
    const me = await requirePermission("production:edit");
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(jobId, tx);
      if (job.status !== "PLANNED") throw new UserError("Only planned jobs can be started.");
      if (job.orderLine.order.status === "ON_HOLD") throw new UserError("The order is on hold. Ask Sales to resume it first.");
      if (job.orderLine.order.status === "CANCELLED") throw new UserError("The order was cancelled.");
      if (!job.machineId) throw new UserError("Assign a machine in the schedule first.");
      if (["DOWN", "MAINTENANCE", "RETIRED"].includes(job.machine!.status)) {
        throw new UserError(`Machine ${job.machine!.code} is ${job.machine!.status.toLowerCase()}. Service must return it to use first.`);
      }
      const busy = await tx.productionJob.findFirst({ where: { machineId: job.machineId, status: "IN_PROGRESS", id: { not: jobId } }, select: { number: true } });
      if (busy) throw new UserError(`Machine ${job.machine!.code} is already running ${busy.number}. Pause or finish it first.`);

      await tx.productionJob.update({ where: { id: jobId }, data: { status: "IN_PROGRESS", actualStart: new Date(), responsibleId: me.id } });
      if (job.moldId) await tx.mold.update({ where: { id: job.moldId }, data: { status: "IN_USE", currentMachineId: job.machineId } });
      const batch = await ensureOpenBatch(jobId, currentShift(), me.id, tx);
      await syncMachineStatus(job.machineId, tx);
      await audit({ userId: me.id, action: "job.start", entityType: "ProductionJob", entityId: jobId, after: { batch: batch.number } }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
      return job.orderLine.orderId;
    });
    refresh(jobId, orderId);
  });
}

// ───────── Report quantities (append-only) ─────────
const reportSchema = z.object({
  jobId: z.string().min(1),
  qtyGood: z.coerce.number().int("Whole pieces only").min(0).max(5_000_000),
  qtyDefective: z.coerce.number().int("Whole pieces only").min(0).max(5_000_000).default(0),
  shift: shiftEnum,
  notes: z.string().trim().max(1000).optional(),
});

export async function reportProductionAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("production:create");
    const v = reportSchema.parse(formObject(fd));
    if (v.qtyGood + v.qtyDefective === 0) throw new UserError("Enter the good and/or defective pieces.");
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(v.jobId, tx);
      if (!["IN_PROGRESS", "PAUSED"].includes(job.status)) throw new UserError("Start the job before reporting quantities.");
      const batch = await ensureOpenBatch(job.id, v.shift, me.id, tx);
      const entry = await tx.productionEntry.create({
        data: { jobId: job.id, batchId: batch.id, shift: v.shift, qtyGood: v.qtyGood, qtyDefective: v.qtyDefective, notes: v.notes ?? null, reportedById: me.id },
      });
      // Shots on the mold = pieces ÷ cavities (rounded up).
      if (job.mold) {
        const shots = Math.ceil((v.qtyGood + v.qtyDefective) / Math.max(job.mold.cavities, 1));
        await tx.mold.update({ where: { id: job.mold.id }, data: { shotCount: { increment: shots } } });
      }
      await audit({ userId: me.id, action: "production.report", entityType: "ProductionJob", entityId: job.id, after: { entry: entry.id, batch: batch.number, good: v.qtyGood, defective: v.qtyDefective, shift: v.shift } }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
      return job.orderLine.orderId;
    });
    refresh(v.jobId, orderId);
  });
}

// ───────── Corrections (never edit old entries — add a balancing entry with a reason) ─────────
const correctionSchema = z.object({
  jobId: z.string().min(1),
  batchId: z.string().min(1, "Choose the batch"),
  goodDelta: z.coerce.number().int().min(-5_000_000).max(5_000_000).default(0),
  defectiveDelta: z.coerce.number().int().min(-5_000_000).max(5_000_000).default(0),
  reason: z.string().trim().min(3, "Please give a reason").max(500),
});

export async function correctProductionAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("production:edit");
    const v = correctionSchema.parse(formObject(fd));
    if (v.goodDelta === 0 && v.defectiveDelta === 0) throw new UserError("Enter how many pieces to add or remove.");
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(v.jobId, tx);
      const batch = await tx.batch.findFirst({ where: { id: v.batchId, jobId: job.id } });
      if (!batch) throw new UserError("That batch doesn't belong to this job.");
      const sums = await tx.productionEntry.aggregate({ where: { batchId: batch.id }, _sum: { qtyGood: true, qtyDefective: true } });
      const good = (sums._sum.qtyGood ?? 0) + v.goodDelta;
      const bad = (sums._sum.qtyDefective ?? 0) + v.defectiveDelta;
      if (good < 0 || bad < 0) throw new UserError("The correction would make the batch total negative.");
      const received = await tx.warehouseReceipt.aggregate({ where: { batchId: batch.id }, _sum: { qtyReceived: true } });
      if (good < (received._sum.qtyReceived ?? 0)) {
        throw new UserError(`The warehouse has already received ${received._sum.qtyReceived} pcs from ${batch.number}. Warehouse must adjust first.`);
      }
      await tx.productionEntry.create({
        data: { jobId: job.id, batchId: batch.id, shift: batch.shift, qtyGood: v.goodDelta, qtyDefective: v.defectiveDelta, isCorrection: true, notes: v.reason, reportedById: me.id },
      });
      await audit({ userId: me.id, action: "production.correct", entityType: "ProductionJob", entityId: job.id, reason: v.reason, after: { batch: batch.number, goodDelta: v.goodDelta, defectiveDelta: v.defectiveDelta } }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
      return job.orderLine.orderId;
    });
    refresh(v.jobId, orderId);
  });
}

// ───────── Batches ─────────
export async function newBatchAction(jobId: string, shift: "A" | "B" | "C") {
  return run(async () => {
    const me = await requirePermission("production:create");
    shiftEnum.parse(shift);
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(jobId, tx);
      if (!["IN_PROGRESS", "PAUSED"].includes(job.status)) throw new UserError("The job isn't running.");
      const open = await tx.batch.findFirst({ where: { jobId, closedAt: null } });
      if (open) {
        const hasQty = await tx.productionEntry.count({ where: { batchId: open.id } });
        if (!hasQty) throw new UserError(`${open.number} has no quantities yet — keep using it.`);
        await tx.batch.update({ where: { id: open.id }, data: { closedAt: new Date() } });
      }
      const b = await ensureOpenBatch(jobId, shift, me.id, tx);
      await audit({ userId: me.id, action: "batch.open", entityType: "ProductionJob", entityId: jobId, after: { closed: open?.number ?? null, opened: b.number } }, tx);
      return job.orderLine.orderId;
    });
    refresh(jobId, orderId);
  });
}

// ───────── Pause / downtime / resume ─────────
const pauseSchema = z.object({
  jobId: z.string().min(1),
  category: z.enum(DOWNTIME_CATEGORIES),
  reason: z.string().trim().min(3, "Describe what happened").max(1000),
  machineProblem: z.string().optional(), // "on" → open a maintenance request for Service
  machineDown: z.string().optional(), // "on" → the machine can't run until repaired
});

async function createMaintenanceRequest(
  me: CurrentUser,
  tx: Tx,
  p: { machineId: string; moldId: string | null; jobId: string; title: string; description: string; machineDown: boolean; priority: "NORMAL" | "HIGH" | "URGENT" },
) {
  if (!me.permissions.has("maintenance:create")) throw new UserError("You don't have permission to create maintenance requests.");
  const mr = await tx.maintenanceRequest.create({
    data: { number: await nextNumber("maintenance", tx), ...p, reportedById: me.id },
  });
  if (p.machineDown) await tx.machine.update({ where: { id: p.machineId }, data: { status: "DOWN" } });
  await audit({ userId: me.id, action: "maintenance.create", entityType: "MaintenanceRequest", entityId: mr.id, after: { number: mr.number, machineDown: p.machineDown, job: p.jobId } }, tx);
  await notify({
    type: "maintenance.new",
    title: `${mr.number}: ${p.title}`,
    body: p.machineDown ? `Machine is down. ${p.description}` : p.description,
    link: `/service/requests/${mr.id}`,
    toPermission: "maintenance:edit",
    exceptUserId: me.id,
  }, tx);
  return mr;
}

export async function pauseJobAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("production:edit");
    const v = pauseSchema.parse(formObject(fd));
    const machineProblem = v.machineProblem === "on" || v.category === "BREAKDOWN";
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(v.jobId, tx);
      if (job.status !== "IN_PROGRESS") throw new UserError("Only running jobs can be paused.");
      const mr = machineProblem && job.machineId
        ? await createMaintenanceRequest(me, tx, {
            machineId: job.machineId,
            moldId: v.category === "MOLD_PROBLEM" ? job.moldId : null,
            jobId: job.id,
            title: `${v.category === "MOLD_PROBLEM" ? "Mold problem" : "Machine problem"} during ${job.number}`,
            description: v.reason,
            machineDown: v.machineDown === "on",
            priority: v.machineDown === "on" ? "URGENT" : "HIGH",
          })
        : null;
      await tx.downtime.create({
        data: { machineId: job.machineId!, jobId: job.id, category: v.category, reason: v.reason, startedAt: new Date(), reportedById: me.id, maintenanceRequestId: mr?.id ?? null },
      });
      await tx.productionJob.update({ where: { id: job.id }, data: { status: "PAUSED" } });
      await syncMachineStatus(job.machineId, tx);
      await audit({ userId: me.id, action: "job.pause", entityType: "ProductionJob", entityId: job.id, reason: v.reason, after: { category: v.category, maintenance: mr?.number ?? null } }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
      return job.orderLine.orderId;
    });
    refresh(v.jobId, orderId);
  });
}

export async function resumeJobAction(jobId: string) {
  return run(async () => {
    const me = await requirePermission("production:edit");
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(jobId, tx);
      if (job.status !== "PAUSED") throw new UserError("This job isn't paused.");
      const m = job.machineId ? await tx.machine.findUnique({ where: { id: job.machineId } }) : null;
      if (m && ["DOWN", "MAINTENANCE"].includes(m.status)) {
        throw new UserError(`Machine ${m.code} is still marked ${m.status.toLowerCase()}. Service must mark the repair complete first.`);
      }
      const busy = await tx.productionJob.findFirst({ where: { machineId: job.machineId, status: "IN_PROGRESS", id: { not: jobId } }, select: { number: true } });
      if (busy) throw new UserError(`The machine is running ${busy.number} now.`);
      await tx.downtime.updateMany({ where: { jobId, endedAt: null }, data: { endedAt: new Date() } });
      await tx.productionJob.update({ where: { id: jobId }, data: { status: "IN_PROGRESS" } });
      await syncMachineStatus(job.machineId, tx);
      await audit({ userId: me.id, action: "job.resume", entityType: "ProductionJob", entityId: jobId }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
      return job.orderLine.orderId;
    });
    refresh(jobId, orderId);
  });
}

/** Record a stop that already happened (e.g. a 20-minute material shortage) without pausing the job. */
const pastDowntimeSchema = z.object({
  jobId: z.string().min(1),
  category: z.enum(DOWNTIME_CATEGORIES),
  reason: z.string().trim().min(3, "Describe what happened").max(1000),
  startedAt: z.string().min(1, "Required"),
  endedAt: z.string().min(1, "Required"),
});

export async function logDowntimeAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("production:create");
    const v = pastDowntimeSchema.parse(formObject(fd));
    const start = parseFactoryDateTime(v.startedAt);
    const end = parseFactoryDateTime(v.endedAt);
    if (end <= start) throw new UserError("The end must be after the start.");
    if (end.getTime() > Date.now() + 5 * 60000) throw new UserError("The end can't be in the future.");
    if (end.getTime() - start.getTime() > 3 * 86_400_000) throw new UserError("That's longer than 3 days — please check the times.");
    const job = await loadJob(v.jobId, db);
    if (!job.machineId) throw new UserError("This job has no machine.");
    await db.$transaction(async (tx) => {
      const d = await tx.downtime.create({ data: { machineId: job.machineId!, jobId: job.id, category: v.category, reason: v.reason, startedAt: start, endedAt: end, reportedById: me.id } });
      await audit({ userId: me.id, action: "downtime.log", entityType: "ProductionJob", entityId: job.id, reason: v.reason, after: { downtime: d.id, category: v.category, minutes: Math.round((end.getTime() - start.getTime()) / 60000) } }, tx);
    });
    refresh(job.id, job.orderLine.orderId);
  });
}

// ───────── Complete ─────────
export async function completeJobAction(jobId: string, note?: string) {
  return run(async () => {
    const me = await requirePermission("production:edit");
    const orderId = await db.$transaction(async (tx) => {
      const job = await loadJob(jobId, tx);
      if (!["IN_PROGRESS", "PAUSED"].includes(job.status)) throw new UserError("Only running or paused jobs can be completed.");
      const produced = await tx.productionEntry.count({ where: { jobId } });
      if (!produced) throw new UserError("No quantities were reported. Report production first, or ask the planner to cancel the job.");
      const now = new Date();
      await tx.downtime.updateMany({ where: { jobId, endedAt: null }, data: { endedAt: now } });
      await tx.batch.updateMany({ where: { jobId, closedAt: null }, data: { closedAt: now } });
      await tx.productionJob.update({ where: { id: jobId }, data: { status: "COMPLETED", actualEnd: now } });
      await syncMachineStatus(job.machineId, tx);
      await audit({ userId: me.id, action: "job.complete", entityType: "ProductionJob", entityId: jobId, reason: note?.trim() || null }, tx);
      await recomputeOrderStatus(job.orderLine.orderId, tx);
      return job.orderLine.orderId;
    });
    refresh(jobId, orderId);
  });
}

// ───────── Daily entry sheet: many jobs in one save ─────────
export type SheetResult = { saved: number; started: number; completed: number; pieces: number; failed: { job: string; error: string }[]; savedIds: string[] };

/**
 * Saves the shift's quantities for many jobs at once. Each job is saved in its own
 * transaction, so one problem (e.g. a machine marked down) never blocks the other rows.
 * Planned jobs that get quantities are started automatically, and jobs ticked "finished" are
 * completed after their quantities are saved (both need production:edit). Rows are processed
 * top to bottom (machine, then planned start), so a machine's finished job is completed
 * before its next job starts.
 */
export async function saveDailySheetAction(_: unknown, fd: FormData) {
  return run(async (): Promise<SheetResult> => {
    const me = await requirePermission("production:create");
    const shift = shiftEnum.parse(fd.get("shift"));
    const newBatch = fd.get("newBatch") === "on";
    const rows = new Map<string, { good: number; bad: number; done: boolean }>();
    for (const [key, raw] of fd.entries()) {
      const m = /^(good|bad|done)_([a-z0-9]{10,40})$/i.exec(key);
      if (!m || typeof raw !== "string" || raw.trim() === "") continue;
      const r = rows.get(m[2]) ?? { good: 0, bad: 0, done: false };
      if (m[1] === "done") r.done = raw === "on";
      else {
        const v = Number(raw);
        if (!Number.isInteger(v) || v < 0 || v > 5_000_000) throw new UserError("Quantities must be whole numbers between 0 and 5,000,000.");
        r[m[1] === "good" ? "good" : "bad"] = v;
      }
      rows.set(m[2], r);
    }
    const work = [...rows.entries()].filter(([, r]) => r.good + r.bad > 0 || r.done);
    if (work.length === 0) throw new UserError("Type the quantities for at least one job.");
    if (work.length > 500) throw new UserError("Save at most 500 jobs at a time.");

    const res: SheetResult = { saved: 0, started: 0, completed: 0, pieces: 0, failed: [], savedIds: [] };
    const orders = new Set<string>();
    for (const [jobId, q] of work) {
      try {
        const out = await db.$transaction(async (tx) => {
          const job = await loadJob(jobId, tx);
          let started = false;
          if (q.done && !me.permissions.has("production:edit")) throw new UserError("Ask a supervisor to complete jobs.");
          if (job.status === "PLANNED" && q.good + q.bad === 0) throw new UserError("Enter its quantities before marking it finished.");
          if (job.status === "PLANNED") {
            if (!me.permissions.has("production:edit")) throw new UserError("Ask a supervisor to start this job first.");
            if (["ON_HOLD", "CANCELLED"].includes(job.orderLine.order.status)) throw new UserError("The order is on hold or cancelled.");
            if (!job.machineId) throw new UserError("No machine assigned in the schedule.");
            if (["DOWN", "MAINTENANCE", "RETIRED"].includes(job.machine!.status)) throw new UserError(`Machine ${job.machine!.code} is not available.`);
            const busy = await tx.productionJob.findFirst({ where: { machineId: job.machineId, status: "IN_PROGRESS", id: { not: jobId } }, select: { number: true } });
            if (busy) throw new UserError(`Machine ${job.machine!.code} is running ${busy.number}.`);
            await tx.productionJob.update({ where: { id: jobId }, data: { status: "IN_PROGRESS", actualStart: new Date(), responsibleId: me.id } });
            if (job.moldId) await tx.mold.update({ where: { id: job.moldId }, data: { status: "IN_USE", currentMachineId: job.machineId } });
            await syncMachineStatus(job.machineId, tx);
            await audit({ userId: me.id, action: "job.start", entityType: "ProductionJob", entityId: jobId, after: { from: "daily sheet" } }, tx);
            started = true;
          } else if (!["IN_PROGRESS", "PAUSED"].includes(job.status)) {
            throw new UserError("This job is already completed or cancelled.");
          }
          if (newBatch && !started) {
            const open = await tx.batch.findFirst({ where: { jobId, closedAt: null } });
            if (open && (await tx.productionEntry.count({ where: { batchId: open.id } }))) {
              await tx.batch.update({ where: { id: open.id }, data: { closedAt: new Date() } });
            }
          }
          if (q.good + q.bad > 0) {
            const batch = await ensureOpenBatch(jobId, shift, me.id, tx);
            const entry = await tx.productionEntry.create({
              data: { jobId, batchId: batch.id, shift, qtyGood: q.good, qtyDefective: q.bad, notes: "Daily sheet", reportedById: me.id },
            });
            if (job.mold) {
              await tx.mold.update({ where: { id: job.mold.id }, data: { shotCount: { increment: Math.ceil((q.good + q.bad) / Math.max(job.mold.cavities, 1)) } } });
            }
            await audit({ userId: me.id, action: "production.report", entityType: "ProductionJob", entityId: jobId, after: { entry: entry.id, batch: batch.number, good: q.good, defective: q.bad, shift, via: "daily sheet" } }, tx);
          }
          if (q.done) {
            if (!(await tx.productionEntry.count({ where: { jobId } }))) throw new UserError("No quantities reported yet — it can't be finished.");
            const now = new Date();
            await tx.downtime.updateMany({ where: { jobId, endedAt: null }, data: { endedAt: now } });
            await tx.batch.updateMany({ where: { jobId, closedAt: null }, data: { closedAt: now } });
            await tx.productionJob.update({ where: { id: jobId }, data: { status: "COMPLETED", actualEnd: now } });
            await syncMachineStatus(job.machineId, tx);
            await audit({ userId: me.id, action: "job.complete", entityType: "ProductionJob", entityId: jobId, reason: "Daily sheet" }, tx);
          }
          await recomputeOrderStatus(job.orderLine.orderId, tx);
          return { orderId: job.orderLine.orderId, started };
        });
        res.saved++; res.pieces += q.good; res.savedIds.push(jobId);
        if (out.started) res.started++;
        if (q.done) res.completed++;
        orders.add(out.orderId);
      } catch (e) {
        const number = (await db.productionJob.findUnique({ where: { id: jobId }, select: { number: true } }))?.number ?? jobId;
        res.failed.push({ job: number, error: e instanceof UserError ? e.message : "Could not be saved." });
        if (!(e instanceof UserError)) console.error("[daily sheet]", e);
      }
    }
    revalidatePath("/production");
    revalidatePath("/production/daily");
    revalidatePath("/dashboard");
    revalidatePath("/schedule");
    for (const o of orders) revalidatePath(`/orders/${o}`);
    return res;
  });
}
