"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, type Tx } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { parseFactoryDate, parseFactoryDateTime } from "@/lib/time";
import { notify } from "@/lib/notify";

const OPEN = ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] as const;

function refreshService(id?: string) {
  revalidatePath("/service");
  if (id) revalidatePath(`/service/requests/${id}`);
  revalidatePath("/history");
  revalidatePath("/assets");
  revalidatePath("/dashboard");
}

/** A machine goes back to service only when no open request still says it's down. */
async function releaseMachineIfClear(machineId: string, tx: Tx) {
  const stillDown = await tx.maintenanceRequest.count({ where: { machineId, machineDown: true, status: { in: [...OPEN] } } });
  if (stillDown) return false;
  const m = await tx.machine.findUnique({ where: { id: machineId } });
  if (m && ["DOWN", "MAINTENANCE"].includes(m.status)) {
    await tx.machine.update({ where: { id: machineId }, data: { status: "AVAILABLE" } });
  }
  return true;
}

// ───────── Maintenance requests ─────────
const requestSchema = z.object({
  machineId: z.string().min(1, "Choose a machine"),
  moldId: z.string().optional(),
  title: z.string().trim().min(3, "Required").max(160),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  machineDown: z.string().optional(),
});

export async function createRequestAction(_: unknown, fd: FormData) {
  let id = "";
  const res = await run(async () => {
    const me = await requirePermission("maintenance:create");
    const v = requestSchema.parse(formObject(fd));
    const down = v.machineDown === "on";
    const mr = await db.$transaction(async (tx) => {
      const r = await tx.maintenanceRequest.create({
        data: {
          number: await nextNumber("maintenance", tx),
          machineId: v.machineId, moldId: v.moldId ?? null,
          title: v.title, description: v.description ?? null, priority: v.priority, machineDown: down, reportedById: me.id,
        },
        include: { machine: true },
      });
      if (down) await tx.machine.update({ where: { id: v.machineId }, data: { status: "DOWN" } });
      await audit({ userId: me.id, action: "maintenance.create", entityType: "MaintenanceRequest", entityId: r.id, after: { number: r.number, machineDown: down } }, tx);
      await notify({
        type: down ? "maintenance.newDown" : "maintenance.new",
        data: { number: r.number, machine: r.machine.code, problem: r.title, by: me.fullName },
        link: `/service/requests/${r.id}`,
        toPermission: "maintenance:view",
        exceptUserId: me.id,
      }, tx);
      return r;
    });
    id = mr.id;
  });
  if (res.ok) {
    refreshService();
    redirect(`/service/requests/${id}`);
  }
  return res;
}

type ReqAction = "start" | "waitParts" | "complete" | "verify" | "reopen" | "cancel";

export async function requestTransitionAction(requestId: string, action: ReqAction, note?: string) {
  return run(async () => {
    const perm = action === "verify" || action === "reopen" ? "maintenance:approve" : "maintenance:edit";
    const me = await requirePermission(perm);
    const text = note?.trim();
    if (["complete", "reopen", "cancel"].includes(action) && (!text || text.length < 3)) {
      throw new UserError(action === "complete" ? "Describe the repair that was done." : "Please give a reason.");
    }

    await db.$transaction(async (tx) => {
      const r = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { machine: true } });
      const now = new Date();
      switch (action) {
        case "start":
          if (!["OPEN", "WAITING_PARTS"].includes(r.status)) throw new UserError("This request can't be started now.");
          await tx.maintenanceRequest.update({ where: { id: r.id }, data: { status: "IN_PROGRESS", assignedToId: r.assignedToId ?? me.id } });
          if (r.machineDown) await tx.machine.update({ where: { id: r.machineId }, data: { status: "MAINTENANCE" } });
          break;
        case "waitParts":
          if (r.status !== "IN_PROGRESS") throw new UserError("Only work in progress can wait for parts.");
          await tx.maintenanceRequest.update({ where: { id: r.id }, data: { status: "WAITING_PARTS" } });
          break;
        case "complete": {
          if (!["IN_PROGRESS", "WAITING_PARTS", "OPEN"].includes(r.status)) throw new UserError("This request is already closed.");
          await tx.maintenanceRequest.update({
            where: { id: r.id },
            data: { status: "COMPLETED", resolution: text, completedAt: now, readyAt: r.machineDown ? now : r.readyAt, assignedToId: r.assignedToId ?? me.id },
          });
          const released = await releaseMachineIfClear(r.machineId, tx);
          // Tell Production the machine can run again (and whoever reported it).
          await notify({
            type: released && r.machineDown ? "maintenance.ready" : "maintenance.completed",
            data: { number: r.number, machine: r.machine.code, problem: r.title, text: text ?? "", by: me.fullName },
            link: `/service/requests/${r.id}`,
            toPermission: "production:edit",
            toUserIds: [r.reportedById],
            exceptUserId: me.id,
            requires: "maintenance:view",
          }, tx);
          await notify({
            type: "maintenance.verify",
            data: { number: r.number, machine: r.machine.code, problem: r.title, by: me.fullName },
            link: `/service/requests/${r.id}`,
            toPermission: "maintenance:approve",
            exceptUserId: me.id,
          }, tx);
          break;
        }
        case "verify":
          if (r.status !== "COMPLETED") throw new UserError("Only completed work can be verified.");
          if (r.assignedToId === me.id && me.roleName !== "Administrator") throw new UserError("Someone other than the technician who did the work must verify it.");
          await tx.maintenanceRequest.update({ where: { id: r.id }, data: { status: "VERIFIED", verifiedAt: now, verifiedById: me.id } });
          break;
        case "reopen":
          if (!["COMPLETED", "VERIFIED"].includes(r.status)) throw new UserError("Only completed work can be reopened.");
          await tx.maintenanceRequest.update({ where: { id: r.id }, data: { status: "IN_PROGRESS", completedAt: null, verifiedAt: null, verifiedById: null, readyAt: null } });
          if (r.machineDown) await tx.machine.update({ where: { id: r.machineId }, data: { status: "MAINTENANCE" } });
          await notify({ type: "maintenance.reopened", data: { number: r.number, machine: r.machine.code, text: text ?? "", by: me.fullName }, link: `/service/requests/${r.id}`, toPermission: "maintenance:edit", exceptUserId: me.id }, tx);
          break;
        case "cancel":
          if (r.status !== "OPEN") throw new UserError("Only requests that haven't been started can be cancelled.");
          await tx.maintenanceRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", resolution: text } });
          await releaseMachineIfClear(r.machineId, tx);
          break;
      }
      await audit({ userId: me.id, action: `maintenance.${action}`, entityType: "MaintenanceRequest", entityId: r.id, reason: text ?? null, before: { status: r.status } }, tx);
    });
    refreshService(requestId);
  });
}

export async function assignRequestAction(requestId: string, userId: string) {
  return run(async () => {
    const me = await requirePermission("maintenance:edit");
    const tech = await db.user.findFirst({ where: { id: userId, active: true } });
    if (!tech) throw new UserError("That employee isn't active.");
    const r = await db.maintenanceRequest.update({ where: { id: requestId }, data: { assignedToId: userId } });
    await audit({ userId: me.id, action: "maintenance.assign", entityType: "MaintenanceRequest", entityId: requestId, after: { assignedTo: tech.fullName } });
    if (userId !== me.id) await notify({ type: "maintenance.assigned", data: { number: r.number, problem: r.title, by: me.fullName }, link: `/service/requests/${r.id}`, toUserIds: [userId] });
    refreshService(requestId);
  });
}

// ───────── Daily service reports ─────────
const reportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  shift: z.enum(["A", "B", "C"]),
  machineId: z.string().min(1, "Choose a machine"),
  moldId: z.string().optional(),
  maintenanceRequestId: z.string().optional(),
  moldRemovedId: z.string().optional(),
  moldInstalledId: z.string().optional(),
  moldChangeReason: z.string().trim().max(1000).optional(),
  workPerformed: z.string().trim().min(3, "Describe the work").max(4000),
  breakdown: z.string().trim().max(2000).optional(),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().optional(),
  downtimeMinutes: z.coerce.number().int().min(0).max(4320).optional(),
  spareParts: z.string().trim().max(2000).optional(),
  repairsCompleted: z.string().trim().max(2000).optional(),
  outstandingWork: z.string().trim().max(2000).optional(),
  followUp: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createServiceReportAction(_: unknown, fd: FormData) {
  let id = "";
  const res = await run(async () => {
    const me = await requirePermission("service:create");
    const v = reportSchema.parse(formObject(fd));
    const start = parseFactoryDateTime(v.startTime);
    const end = v.endTime ? parseFactoryDateTime(v.endTime) : null;
    if (end && end <= start) throw new UserError("End time must be after start time.");
    if (start.getTime() > Date.now() + 15 * 60000) throw new UserError("Start time is in the future.");
    if (v.moldRemovedId && v.moldInstalledId && v.moldRemovedId === v.moldInstalledId) throw new UserError("Removed and installed mold are the same.");
    if ((v.moldRemovedId || v.moldInstalledId) && !v.moldChangeReason) throw new UserError("Give the reason for the mold change.");
    const downtime = v.downtimeMinutes ?? (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);

    const sr = await db.$transaction(async (tx) => {
      const machine = await tx.machine.findUniqueOrThrow({ where: { id: v.machineId } });
      if (v.moldRemovedId) {
        const m = await tx.mold.findUniqueOrThrow({ where: { id: v.moldRemovedId } });
        if (m.currentMachineId && m.currentMachineId !== v.machineId) throw new UserError(`Mold ${m.code} is recorded on a different machine.`);
        await tx.mold.update({ where: { id: m.id }, data: { currentMachineId: null, status: m.status === "IN_REPAIR" ? "IN_REPAIR" : "AVAILABLE" } });
      }
      if (v.moldInstalledId) {
        const m = await tx.mold.findUniqueOrThrow({ where: { id: v.moldInstalledId } });
        if (["IN_REPAIR", "RETIRED"].includes(m.status)) throw new UserError(`Mold ${m.code} is ${m.status.toLowerCase().replace("_", " ")}.`);
        // Any other mold still recorded on this machine is taken off it.
        await tx.mold.updateMany({ where: { currentMachineId: v.machineId, id: { not: m.id } }, data: { currentMachineId: null, status: "AVAILABLE" } });
        await tx.mold.update({ where: { id: m.id }, data: { currentMachineId: v.machineId, status: "IN_USE" } });
      }
      const r = await tx.serviceReport.create({
        data: {
          number: await nextNumber("service", tx),
          date: parseFactoryDate(v.date), shift: v.shift, technicianId: me.id, machineId: v.machineId,
          moldId: v.moldId ?? v.moldInstalledId ?? null, maintenanceRequestId: v.maintenanceRequestId ?? null,
          moldRemovedId: v.moldRemovedId ?? null, moldInstalledId: v.moldInstalledId ?? null, moldChangeReason: v.moldChangeReason ?? null,
          workPerformed: v.workPerformed, breakdown: v.breakdown ?? null, startTime: start, endTime: end, downtimeMinutes: downtime,
          spareParts: v.spareParts ?? null, repairsCompleted: v.repairsCompleted ?? null, outstandingWork: v.outstandingWork ?? null,
          followUp: v.followUp ?? null, notes: v.notes ?? null,
        },
      });
      if (v.maintenanceRequestId) {
        const mr = await tx.maintenanceRequest.findUnique({ where: { id: v.maintenanceRequestId } });
        if (mr?.status === "OPEN") await tx.maintenanceRequest.update({ where: { id: mr.id }, data: { status: "IN_PROGRESS", assignedToId: mr.assignedToId ?? me.id } });
      }
      await audit({ userId: me.id, action: "service.report", entityType: "ServiceReport", entityId: r.id, after: { number: r.number, machine: machine.code, moldRemoved: v.moldRemovedId ?? null, moldInstalled: v.moldInstalledId ?? null, downtime } }, tx);
      await notify({ type: "service.report", data: { number: r.number, machine: machine.code, work: v.workPerformed.slice(0, 200), by: me.fullName }, link: `/service/reports/${r.id}`, toPermission: "service:view", exceptUserId: me.id }, tx);
      return r;
    });
    id = sr.id;
  });
  if (res.ok) {
    refreshService();
    redirect(`/service/reports/${id}`);
  }
  return res;
}

// ───────── Preventive maintenance ─────────
const pmSchema = z.object({
  title: z.string().trim().min(3, "Required").max(160),
  machineId: z.string().optional(),
  moldId: z.string().optional(),
  intervalDays: z.coerce.number().int().min(1, "At least 1 day").max(730),
  nextDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
});

export async function savePreventiveAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("maintenance:edit");
    const raw = formObject(fd);
    const v = pmSchema.parse(raw);
    if (!v.machineId && !v.moldId) throw new UserError("Choose a machine or a mold.");
    const data = { title: v.title, machineId: v.machineId ?? null, moldId: v.moldId ?? null, intervalDays: v.intervalDays, nextDueAt: parseFactoryDate(v.nextDueAt) };
    const id = raw.id as string | undefined;
    const pm = id ? await db.preventiveTask.update({ where: { id }, data }) : await db.preventiveTask.create({ data });
    await audit({ userId: me.id, action: id ? "preventive.update" : "preventive.create", entityType: "PreventiveTask", entityId: pm.id, after: { title: pm.title, every: pm.intervalDays } });
    refreshService();
  });
}

export async function preventiveDoneAction(taskId: string, note?: string) {
  return run(async () => {
    const me = await requirePermission("service:create");
    const t = await db.preventiveTask.findUniqueOrThrow({ where: { id: taskId } });
    const now = new Date();
    await db.preventiveTask.update({ where: { id: taskId }, data: { lastDoneAt: now, nextDueAt: new Date(now.getTime() + t.intervalDays * 86_400_000) } });
    await audit({ userId: me.id, action: "preventive.done", entityType: "PreventiveTask", entityId: taskId, reason: note?.trim() || null, after: { title: t.title } });
    refreshService();
  });
}

export async function preventiveToRequestAction(taskId: string) {
  return run(async () => {
    const me = await requirePermission("maintenance:create");
    const t = await db.preventiveTask.findUniqueOrThrow({ where: { id: taskId }, include: { mold: true } });
    const machineId = t.machineId ?? t.mold?.currentMachineId;
    if (!machineId) throw new UserError("This mold isn't on a machine — record the work with a service report instead.");
    const r = await db.$transaction(async (tx) => {
      const mr = await tx.maintenanceRequest.create({
        data: { number: await nextNumber("maintenance", tx), machineId, moldId: t.moldId, title: `Preventive: ${t.title}`, priority: "NORMAL", isPreventive: true, reportedById: me.id },
      });
      await audit({ userId: me.id, action: "maintenance.create", entityType: "MaintenanceRequest", entityId: mr.id, after: { number: mr.number, preventive: t.title } }, tx);
      return mr;
    });
    refreshService();
    return { id: r.id };
  });
}

export async function setPreventiveActiveAction(taskId: string, active: boolean) {
  return run(async () => {
    const me = await requirePermission("maintenance:edit");
    await db.preventiveTask.update({ where: { id: taskId }, data: { active } });
    await audit({ userId: me.id, action: active ? "preventive.enable" : "preventive.disable", entityType: "PreventiveTask", entityId: taskId });
    refreshService();
  });
}
