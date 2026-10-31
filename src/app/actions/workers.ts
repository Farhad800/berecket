"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Shift } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { can, requirePermission, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { run, UserError } from "@/lib/action";
import { DEFAULT_SALARY, SHIFT_NO, assertSalaries, assertWork, maySeeSalaries, dayDate, nameKey, phoneKey, scopeOf, ymdDate } from "@/lib/workers";
import { todayYmd } from "@/lib/production";

/** Employees (factory workers), shifts, leaders, salaries, departures and the blacklist (owner, 31 Oct 2026). */
const SHIFT = z.enum(["A", "B", "C"]);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const NAME = z.string().trim().min(3, "Type the full name").max(160);
const PHONE = z.string().trim().min(6, "Type the phone number").max(40).regex(/^[0-9+()\-\s]+$/, "The phone number can only have digits, spaces, + and -");
const SALARY = z.coerce.number().positive("The salary must be more than 0").max(100_000_000).refine((n) => Number.isInteger(n), "Whole IQD only");
const REASON = z.string().trim().min(3, "Write the reason").max(500);
const done = (...extra: string[]) => { for (const p of ["/workers", ...extra]) revalidatePath(p); };

export type Match = { kind: "worker" | "blacklist"; id: string; name: string; phone: string; shift: Shift | null; status: string; reason?: string; why: ("name" | "phone")[] };

/** Workers (any status) and active blacklist entries that share the name or the phone. */
async function findMatches(fullName: string, phone: string, tx: Tx, exceptId?: string): Promise<Match[]> {
  const pk = phoneKey(phone), nk = nameKey(fullName);
  const [workers, black] = await Promise.all([
    tx.worker.findMany({ where: { id: exceptId ? { not: exceptId } : undefined }, select: { id: true, fullName: true, phone: true, phoneKey: true, shift: true, status: true } }),
    tx.blacklistEntry.findMany({ where: { active: true }, select: { id: true, fullName: true, phone: true, phoneKey: true, shift: true, reason: true } }),
  ]);
  const why = (n: string, p: string) => [...(nameKey(n) === nk ? ["name" as const] : []), ...(pk && p === pk ? ["phone" as const] : [])];
  return [
    ...black.map((b) => ({ kind: "blacklist" as const, id: b.id, name: b.fullName, phone: b.phone, shift: b.shift, status: "BLACKLISTED", reason: b.reason, why: why(b.fullName, b.phoneKey) })),
    ...workers.map((w) => ({ kind: "worker" as const, id: w.id, name: w.fullName, phone: w.phone, shift: w.shift, status: w.status, why: why(w.fullName, w.phoneKey) })),
  ].filter((m) => m.why.length > 0);
}

const createSchema = z.object({ fullName: NAME, shift: SHIFT, salary: SALARY.default(DEFAULT_SALARY), startDate: DAY, phone: PHONE, reviewed: z.boolean().default(false) });

/**
 * Adds an employee: the five fields, an automatic number (W-0001), salary 400,000 IQD by default.
 * A name or phone that matches an earlier employee or the blacklist is shown first and needs "reviewed".
 */
export async function createWorkerAction(input: unknown) {
  return run(async () => {
    const v = createSchema.parse(input);
    const me = await requirePermission("workers:manage");
    if (v.salary !== DEFAULT_SALARY && !maySeeSalaries(me, "workers:salary")) throw new UserError("Only the administrator can set a different salary.");
    return db.$transaction(async (tx) => {
      const matches = await findMatches(v.fullName, v.phone, tx);
      const dup = matches.find((m) => m.kind === "worker" && m.status === "ACTIVE" && m.why.includes("phone"));
      if (dup) throw new UserError(`${dup.name} is already an active employee with this phone number (shift ${SHIFT_NO[dup.shift!]}).`);
      if (matches.length && !v.reviewed) return { saved: false as const, matches };
      const number = await nextNumber("worker", tx);
      const w = await tx.worker.create({ data: { number, fullName: v.fullName, phone: v.phone, phoneKey: phoneKey(v.phone), shift: v.shift, salary: v.salary, startDate: dayDate(v.startDate), createdById: me.id } });
      await audit({ userId: me.id, action: "worker.create", entityType: "Worker", entityId: w.id,
        after: { number, name: v.fullName, phone: v.phone, shift: SHIFT_NO[v.shift], startDate: v.startDate, salary: v.salary, ...(matches.length ? { reviewedMatches: matches.map((m) => `${m.kind}: ${m.name} (${m.why.join(", ")})`) } : {}) } }, tx);
      return { saved: true as const, id: w.id, number };
    });
  }).then((r) => { done(); return r; });
}

const updateSchema = z.object({ id: z.string().min(1).max(40), fullName: NAME, phone: PHONE, startDate: DAY });

/** Name, phone and start date (administrator). */
export async function updateWorkerAction(input: unknown) {
  return run(async () => {
    const v = updateSchema.parse(input);
    const me = await requirePermission("workers:manage");
    await db.$transaction(async (tx) => {
      const w = await tx.worker.findUnique({ where: { id: v.id } });
      if (!w) throw new UserError("That employee no longer exists.");
      const dup = (await findMatches(v.fullName, v.phone, tx, v.id)).find((m) => m.kind === "worker" && m.status === "ACTIVE" && m.why.includes("phone"));
      if (dup) throw new UserError(`${dup.name} already has this phone number.`);
      await tx.worker.update({ where: { id: v.id }, data: { fullName: v.fullName, phone: v.phone, phoneKey: phoneKey(v.phone), startDate: dayDate(v.startDate) } });
      await audit({ userId: me.id, action: "worker.update", entityType: "Worker", entityId: v.id,
        before: { name: w.fullName, phone: w.phone, startDate: ymdDate(w.startDate) }, after: { name: v.fullName, phone: v.phone, startDate: v.startDate } }, tx);
    });
    done(`/workers/${v.id}`);
  });
}

/** Salary change (administrator only). Payroll uses the salary in force on the 1st, so it counts from next month. */
export async function changeSalaryAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), salary: SALARY, reason: REASON }).parse(input);
    const me = await requirePermission("workers:salary");
    assertSalaries(me, "workers:salary");
    await db.$transaction(async (tx) => {
      const w = await tx.worker.findUnique({ where: { id: v.id } });
      if (!w) throw new UserError("That employee no longer exists.");
      if (Number(w.salary) === v.salary) throw new UserError("The salary is the same as now.");
      await tx.worker.update({ where: { id: v.id }, data: { salary: v.salary } });
      await tx.workerSalaryChange.create({ data: { workerId: v.id, oldSalary: w.salary, newSalary: v.salary, reason: v.reason, changedById: me.id } });
      await audit({ userId: me.id, action: "worker.salary", entityType: "Worker", entityId: v.id, reason: v.reason,
        before: { number: w.number, salary: Number(w.salary) }, after: { number: w.number, salary: v.salary } }, tx);
    });
    done(`/workers/${v.id}`, "/workers/payroll");
  });
}

/** Moves an employee to another shift; earlier attendance and penalties stay with their old shift. */
export async function transferWorkerAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), shift: SHIFT, reason: z.string().trim().max(500).optional() }).parse(input);
    const me = await requirePermission("workers:manage");
    await db.$transaction(async (tx) => {
      const w = await tx.worker.findUnique({ where: { id: v.id } });
      if (!w) throw new UserError("That employee no longer exists.");
      if (w.status !== "ACTIVE") throw new UserError("Only active employees can move shift.");
      if (w.shift === v.shift) throw new UserError("The employee is already in that shift.");
      await tx.worker.update({ where: { id: v.id }, data: { shift: v.shift } });
      await tx.workerShiftChange.create({ data: { workerId: v.id, fromShift: w.shift, toShift: v.shift, reason: v.reason || null, changedById: me.id } });
      await audit({ userId: me.id, action: "worker.transfer", entityType: "Worker", entityId: v.id, reason: v.reason ?? null,
        before: { number: w.number, shift: SHIFT_NO[w.shift] }, after: { number: w.number, shift: SHIFT_NO[v.shift] } }, tx);
    });
    done(`/workers/${v.id}`);
  });
}

/** Names the team leader of a shift (a system user), or none. */
export async function setLeaderAction(input: unknown) {
  return run(async () => {
    const v = z.object({ shift: SHIFT, userId: z.string().max(40).optional() }).parse(input);
    const me = await requirePermission("workers:manage");
    await db.$transaction(async (tx) => {
      if (v.userId && !(await tx.user.count({ where: { id: v.userId, active: true } }))) throw new UserError("That user doesn't exist or is not active.");
      const before = await tx.shiftLeader.findUnique({ where: { shift: v.shift } });
      await tx.shiftLeader.upsert({ where: { shift: v.shift }, update: { userId: v.userId || null, updatedById: me.id }, create: { shift: v.shift, userId: v.userId || null, updatedById: me.id } });
      const name = async (id?: string | null) => (id ? (await tx.user.findUnique({ where: { id }, select: { fullName: true } }))?.fullName ?? null : null);
      await audit({ userId: me.id, action: "worker.leader", entityType: "Shift", entityId: v.shift,
        before: { shift: SHIFT_NO[v.shift], leader: await name(before?.userId) }, after: { shift: SHIFT_NO[v.shift], leader: await name(v.userId) } }, tx);
      if (v.userId) await notify({ type: "worker.leader", data: { shift: SHIFT_NO[v.shift], by: me.fullName }, link: "/workers/attendance", toUserIds: [v.userId], exceptUserId: me.id }, tx);
    });
    done("/workers/shifts", "/workers/attendance");
  });
}

const departSchema = z.object({
  workerId: z.string().min(1).max(40), kind: z.enum(["FIRED", "QUIT"]), lastDay: DAY,
  explanation: z.string().trim().min(5, "Write what happened").max(2000),
  blacklist: z.object({ reason: REASON, details: z.string().trim().min(5, "Write the details").max(2000) }).optional(),
});

/**
 * Fired or quit. The employee leaves the attendance lists at once (inactive after the last working day);
 * the administrator confirms it later or undoes it with a reason. Fired employees can also be blacklisted.
 */
export async function recordDepartureAction(input: unknown) {
  return run(async () => {
    // The form sends "also add to the blacklist" as a tick and two boxes.
    const raw = { ...(input as Record<string, unknown>) };
    if (raw.toBlacklist === true) raw.blacklist = { reason: raw.blackReason ?? "", details: raw.blackDetails ?? "" };
    if (raw.toBlacklist === false && (raw.blackReason || raw.blackDetails)) throw new UserError("Tick \"also add to the blacklist\" to blacklist this employee, or empty those two boxes.");
    delete raw.toBlacklist; delete raw.blackReason; delete raw.blackDetails;
    const v = departSchema.parse(raw);
    const me = await requirePermission("workers:edit");
    if (v.blacklist && v.kind !== "FIRED") throw new UserError("Only a fired employee can be added to the blacklist here.");
    if (v.blacklist && !can(me, "blacklist:create")) throw new UserError("You don't have permission to add to the blacklist.");
    if (v.lastDay > todayYmd()) throw new UserError("The last working day can't be in the future.");
    await db.$transaction(async (tx) => {
      const scope = await scopeOf(me, tx);
      const w = await tx.worker.findUnique({ where: { id: v.workerId } });
      if (!w) throw new UserError("That employee no longer exists.");
      assertWork(scope, w.shift);
      if (w.status !== "ACTIVE") throw new UserError("This employee is already inactive.");
      if (v.lastDay < ymdDate(w.startDate)) throw new UserError("The last working day is before the start date.");
      const confirmed = can(me, "workers:manage"); // the administrator's own record needs no second step
      const d = await tx.workerDeparture.create({ data: { workerId: w.id, kind: v.kind, lastDay: dayDate(v.lastDay), explanation: v.explanation, shift: w.shift, recordedById: me.id,
        ...(confirmed ? { state: "APPROVED", decidedById: me.id, decidedAt: new Date() } : {}) } });
      await tx.worker.update({ where: { id: w.id }, data: { status: "INACTIVE", endDate: dayDate(v.lastDay) } });
      await audit({ userId: me.id, action: v.kind === "FIRED" ? "worker.fired" : "worker.quit", entityType: "Worker", entityId: w.id, reason: v.explanation,
        before: { number: w.number, status: "ACTIVE" }, after: { number: w.number, name: w.fullName, phone: w.phone, shift: SHIFT_NO[w.shift], status: "INACTIVE", lastDay: v.lastDay, kind: v.kind } }, tx);
      if (v.blacklist) {
        const b = await tx.blacklistEntry.create({ data: { workerId: w.id, fullName: w.fullName, phone: w.phone, phoneKey: w.phoneKey, shift: w.shift, reason: v.blacklist.reason, details: v.blacklist.details, addedById: me.id } });
        await audit({ userId: me.id, action: "blacklist.add", entityType: "BlacklistEntry", entityId: b.id, reason: v.blacklist.reason, after: { name: w.fullName, phone: w.phone, shift: SHIFT_NO[w.shift], details: v.blacklist.details } }, tx);
        await notify({ type: "blacklist.added", data: { name: w.fullName, shift: SHIFT_NO[w.shift], by: me.fullName }, link: "/workers/blacklist", toPermission: "blacklist:view", exceptUserId: me.id }, tx);
      }
      if (!confirmed) await notify({ type: "worker.departure", data: { name: w.fullName, kind: v.kind, shift: SHIFT_NO[w.shift], by: me.fullName }, link: "/workers/inactive", toPermission: "workers:manage", exceptUserId: me.id }, tx);
      return d.id;
    });
    done(`/workers/${v.workerId}`, "/workers/inactive", "/workers/blacklist", "/workers/attendance");
  });
}

/** The administrator confirms a departure, or undoes it (the employee is active again) with a reason. */
export async function decideDepartureAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(input);
    const me = await requirePermission("workers:manage");
    if (!v.approve && (v.note ?? "").length < 3) throw new UserError("Write why the departure is undone.");
    await db.$transaction(async (tx) => {
      const d = await tx.workerDeparture.findUnique({ where: { id: v.id }, include: { worker: true } });
      if (!d) throw new UserError("That record no longer exists.");
      if (d.state !== "WAITING") throw new UserError("This departure was already decided.");
      await tx.workerDeparture.update({ where: { id: d.id }, data: { state: v.approve ? "APPROVED" : "REJECTED", decidedById: me.id, decidedAt: new Date(), decisionNote: v.note || null } });
      if (!v.approve) await tx.worker.update({ where: { id: d.workerId }, data: { status: "ACTIVE", endDate: null } });
      await audit({ userId: me.id, action: v.approve ? "worker.departureConfirm" : "worker.departureUndo", entityType: "Worker", entityId: d.workerId, reason: v.note ?? null,
        after: { number: d.worker.number, kind: d.kind, lastDay: ymdDate(d.lastDay), status: v.approve ? "INACTIVE" : "ACTIVE" } }, tx);
    });
    done("/workers/inactive");
  });
}

const blackSchema = z.object({
  workerId: z.string().max(40).optional(), fullName: NAME.optional(), phone: PHONE.optional(), shift: SHIFT.optional(),
  reason: REASON, details: z.string().trim().min(5, "Write the details").max(2000),
});

/** Adds someone to the shared blacklist (an employee, or a name + phone of someone not in the list). */
export async function addBlacklistAction(input: unknown) {
  return run(async () => {
    const v = blackSchema.parse(input);
    const me = await requirePermission("blacklist:create");
    await db.$transaction(async (tx) => {
      let who: { workerId: string | null; fullName: string; phone: string; shift: Shift | null };
      if (v.workerId) {
        const w = await tx.worker.findUnique({ where: { id: v.workerId } });
        if (!w) throw new UserError("That employee no longer exists.");
        const scope = await scopeOf(me, tx);
        if (!scope.all) assertWork(scope, w.shift);
        who = { workerId: w.id, fullName: w.fullName, phone: w.phone, shift: w.shift };
      } else {
        if (!v.fullName || !v.phone) throw new UserError("Type the full name and the phone number.");
        who = { workerId: null, fullName: v.fullName, phone: v.phone, shift: v.shift ?? null };
      }
      const pk = phoneKey(who.phone);
      if (await tx.blacklistEntry.count({ where: { active: true, OR: [{ phoneKey: pk }, ...(who.workerId ? [{ workerId: who.workerId }] : [])] } })) throw new UserError("This person is already on the blacklist.");
      const b = await tx.blacklistEntry.create({ data: { ...who, phoneKey: pk, reason: v.reason, details: v.details, addedById: me.id } });
      await audit({ userId: me.id, action: "blacklist.add", entityType: "BlacklistEntry", entityId: b.id, reason: v.reason, after: { name: who.fullName, phone: who.phone, shift: who.shift ? SHIFT_NO[who.shift] : null, details: v.details } }, tx);
      await notify({ type: "blacklist.added", data: { name: who.fullName, shift: who.shift ? SHIFT_NO[who.shift] : "—", by: me.fullName }, link: "/workers/blacklist", toPermission: "blacklist:view", exceptUserId: me.id }, tx);
    });
    done("/workers/blacklist");
  });
}

/** Asks to take someone off the blacklist (the administrator decides). The administrator's own request is decided at once. */
export async function requestBlacklistRemovalAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), reason: REASON }).parse(input);
    const me = await requireUser();
    if (!can(me, "blacklist:create") && !can(me, "blacklist:manage")) throw new UserError("You don't have permission to do this.");
    await db.$transaction(async (tx) => {
      const b = await tx.blacklistEntry.findUnique({ where: { id: v.id } });
      if (!b || !b.active) throw new UserError("This person is no longer on the blacklist.");
      if (b.removalState === "WAITING") throw new UserError("Removal was already asked for; waiting for the administrator.");
      const admin = can(me, "blacklist:manage");
      await tx.blacklistEntry.update({ where: { id: b.id }, data: {
        removalState: admin ? "APPROVED" : "WAITING", removalReason: v.reason, removalRequestedById: me.id, removalRequestedAt: new Date(),
        ...(admin ? { active: false, removalDecidedById: me.id, removalDecidedAt: new Date() } : {}),
      } });
      await audit({ userId: me.id, action: admin ? "blacklist.remove" : "blacklist.removeAsk", entityType: "BlacklistEntry", entityId: b.id, reason: v.reason, after: { name: b.fullName, phone: b.phone } }, tx);
      if (!admin) await notify({ type: "blacklist.removeAsk", data: { name: b.fullName, by: me.fullName }, link: "/workers/blacklist", toPermission: "blacklist:manage", exceptUserId: me.id }, tx);
    });
    done("/workers/blacklist");
  });
}

/** The administrator approves or refuses a removal request. Approved = off the list; the entry stays in history. */
export async function decideBlacklistRemovalAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), approve: z.boolean() }).parse(input);
    const me = await requirePermission("blacklist:manage");
    await db.$transaction(async (tx) => {
      const b = await tx.blacklistEntry.findUnique({ where: { id: v.id } });
      if (!b || b.removalState !== "WAITING") throw new UserError("There is no removal request waiting for this person.");
      await tx.blacklistEntry.update({ where: { id: b.id }, data: { removalState: v.approve ? "APPROVED" : "REJECTED", removalDecidedById: me.id, removalDecidedAt: new Date(), ...(v.approve ? { active: false } : {}) } });
      await audit({ userId: me.id, action: v.approve ? "blacklist.remove" : "blacklist.removeRefused", entityType: "BlacklistEntry", entityId: b.id, reason: b.removalReason, after: { name: b.fullName, phone: b.phone } }, tx);
    });
    done("/workers/blacklist");
  });
}
