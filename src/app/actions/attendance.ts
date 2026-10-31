"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { run, UserError } from "@/lib/action";
import { once, submissionKey } from "@/lib/submission";
import { SHIFT_NO, assertMonthOpen, assertWork, dayDate, scopeOf, ymdDate } from "@/lib/workers";
import { todayYmd } from "@/lib/production";

/**
 * Daily attendance (owner, 31 Oct 2026): the team leader picks only who was absent (Absent / Excused);
 * submitting records everyone else in the shift as Present. One report per shift and day.
 * Excuses and extra deduction days are approved separately; penalties are money in IQD.
 */
const SHIFT = z.enum(["A", "B", "C"]);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const REASON = z.string().trim().min(3, "Write the reason").max(500);
const MARK = z.object({ workerId: z.string().min(1).max(40), status: z.enum(["ABSENT", "EXCUSED"]), reason: z.string().trim().max(500).optional() });
const done = (...extra: string[]) => { for (const p of ["/workers/attendance", "/workers/excuses", "/workers/payroll", ...extra]) revalidatePath(p); };

function checkMarks(marks: z.infer<typeof MARK>[]) {
  const ids = marks.map((m) => m.workerId);
  if (new Set(ids).size !== ids.length) throw new UserError("The same employee is marked twice.");
  for (const m of marks) if (m.status === "EXCUSED" && (m.reason ?? "").length < 3) throw new UserError("Write the reason for every excused absence.");
}

/** Submits a shift's daily report. Unpicked active employees are recorded Present. */
export async function submitAttendanceAction(input: unknown) {
  return run(async () => {
    const v = z.object({ shift: SHIFT, day: DAY, marks: z.array(MARK).max(2000), submissionId: z.string().optional() }).parse(input);
    const me = await requirePermission("attendance:create");
    if (v.day > todayYmd()) throw new UserError("Attendance can't be submitted for a future day.");
    checkMarks(v.marks);
    const { result } = await once(submissionKey(v.submissionId), me.id, "attendance.submit", async (tx) => {
      assertWork(await scopeOf(me, tx), v.shift);
      await assertMonthOpen(tx, v.day);
      // Held per shift and day, so two leaders pressing Submit at once make one report.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"attendance:" + v.shift + ":" + v.day}))`;
      if (await tx.attendanceReport.findUnique({ where: { shift_day: { shift: v.shift, day: dayDate(v.day) } } })) throw new UserError(`Attendance for shift ${SHIFT_NO[v.shift]} on ${v.day} was already submitted. Open it to correct it.`);
      const workers = await tx.worker.findMany({ where: { shift: v.shift, status: "ACTIVE", startDate: { lte: dayDate(v.day) } }, select: { id: true, number: true } });
      if (!workers.length) throw new UserError("There are no active employees in this shift for that day.");
      const byId = new Set(workers.map((w) => w.id));
      for (const m of v.marks) if (!byId.has(m.workerId)) throw new UserError("One of the marked employees is not active in this shift. Reload the page.");
      const mark = new Map(v.marks.map((m) => [m.workerId, m]));
      let report;
      try {
        report = await tx.attendanceReport.create({ data: { shift: v.shift, day: dayDate(v.day), submittedById: me.id } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("Attendance for this shift and day was already submitted.");
        throw e;
      }
      await tx.attendanceRecord.createMany({ data: workers.map((w) => {
        const m = mark.get(w.id);
        return { reportId: report.id, workerId: w.id, day: dayDate(v.day), status: m?.status ?? "PRESENT",
          ...(m?.status === "EXCUSED" ? { excuseReason: m.reason!, excuseState: "WAITING" as const, excuseById: me.id } : {}) };
      }) });
      const counts = { present: workers.length - v.marks.length, absent: v.marks.filter((m) => m.status === "ABSENT").length, excused: v.marks.filter((m) => m.status === "EXCUSED").length, total: workers.length };
      await audit({ userId: me.id, action: "attendance.submit", entityType: "AttendanceReport", entityId: report.id, after: { shift: SHIFT_NO[v.shift], day: v.day, ...counts } }, tx);
      if (counts.excused) await notify({ type: "attendance.excuses", data: { n: counts.excused, shift: SHIFT_NO[v.shift], day: v.day, by: me.fullName }, link: "/workers/excuses", toPermission: "attendance:approve", exceptUserId: me.id }, tx);
      return { id: report.id, ...counts };
    });
    done();
    return result;
  });
}

/** Corrects a submitted report: every changed employee is written to the history with old and new status and the reason. */
export async function correctAttendanceAction(input: unknown) {
  return run(async () => {
    const v = z.object({ reportId: z.string().min(1).max(40), marks: z.array(MARK).max(2000), reason: REASON }).parse(input);
    const me = await requirePermission("attendance:edit");
    checkMarks(v.marks);
    const res = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AttendanceReport" WHERE id = ${v.reportId} FOR UPDATE`;
      const rep = await tx.attendanceReport.findUnique({ where: { id: v.reportId }, include: { records: { include: { worker: { select: { number: true, fullName: true } }, extra: true } } } });
      if (!rep) throw new UserError("That report no longer exists.");
      assertWork(await scopeOf(me, tx), rep.shift);
      const day = ymdDate(rep.day);
      await assertMonthOpen(tx, day);
      const mark = new Map(v.marks.map((m) => [m.workerId, m]));
      for (const m of v.marks) if (!rep.records.some((r) => r.workerId === m.workerId)) throw new UserError("One of the marked employees is not in this report.");
      const changes: { worker: string; before: string; after: string }[] = [];
      for (const r of rep.records) {
        const m = mark.get(r.workerId);
        const status = m?.status ?? "PRESENT";
        const reasonChanged = status === "EXCUSED" && r.status === "EXCUSED" && (m?.reason ?? "") !== (r.excuseReason ?? "");
        if (status === r.status && !reasonChanged) continue;
        await tx.attendanceRecord.update({ where: { id: r.id }, data: status === "EXCUSED"
          ? { status, excuseReason: m!.reason!, excuseState: r.status === "EXCUSED" ? r.excuseState : "WAITING", excuseById: me.id, ...(r.status === "EXCUSED" ? {} : { decidedById: null, decidedAt: null, decisionNote: null }) }
          : { status, ...(r.status === "EXCUSED" ? { excuseState: null, excuseReason: null, decidedById: null, decidedAt: null, decisionNote: null } : {}) } });
        // An absence corrected away takes its extra deduction days with it.
        if (r.status === "ABSENT" && status !== "ABSENT" && r.extra && r.extra.state !== "REJECTED") {
          await tx.extraDeduction.update({ where: { id: r.extra.id }, data: { state: "REJECTED", decidedById: me.id, decidedAt: new Date(), decisionNote: "The absence was corrected" } });
        }
        changes.push({ worker: `${r.worker.number} ${r.worker.fullName}`, before: r.status + (r.status === "EXCUSED" ? ` (${r.excuseReason})` : ""), after: status + (status === "EXCUSED" ? ` (${m!.reason})` : "") });
      }
      if (!changes.length) throw new UserError("Nothing was changed.");
      await tx.attendanceReport.update({ where: { id: rep.id }, data: { correctedAt: new Date() } });
      await audit({ userId: me.id, action: "attendance.correct", entityType: "AttendanceReport", entityId: rep.id, reason: v.reason,
        before: { shift: SHIFT_NO[rep.shift], day, changes: changes.map((c) => `${c.worker}: ${c.before}`) }, after: { shift: SHIFT_NO[rep.shift], day, changes: changes.map((c) => `${c.worker}: ${c.after}`) } }, tx);
      return { changed: changes.length };
    });
    done();
    return res;
  });
}

/** Approves or rejects an excused absence. Rejected = an ordinary absence (and deducted), recorded with the reason. */
export async function decideExcuseAction(input: unknown) {
  return run(async () => {
    const v = z.object({ recordId: z.string().min(1).max(40), approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(input);
    const me = await requirePermission("attendance:approve");
    if (!v.approve && (v.note ?? "").length < 3) throw new UserError("Write why the excuse is rejected.");
    await db.$transaction(async (tx) => {
      const r = await tx.attendanceRecord.findUnique({ where: { id: v.recordId }, include: { worker: { select: { number: true, fullName: true } } } });
      if (!r || r.status !== "EXCUSED" || r.excuseState !== "WAITING") throw new UserError("There is no excuse waiting for a decision here.");
      await assertMonthOpen(tx, ymdDate(r.day));
      await tx.attendanceRecord.update({ where: { id: r.id }, data: v.approve
        ? { excuseState: "APPROVED", decidedById: me.id, decidedAt: new Date(), decisionNote: v.note || null }
        : { status: "ABSENT", excuseState: "REJECTED", decidedById: me.id, decidedAt: new Date(), decisionNote: v.note! } });
      await audit({ userId: me.id, action: v.approve ? "attendance.excuseApprove" : "attendance.excuseReject", entityType: "AttendanceRecord", entityId: r.id, reason: v.note ?? r.excuseReason,
        before: { worker: `${r.worker.number} ${r.worker.fullName}`, day: ymdDate(r.day), status: "EXCUSED (waiting)" }, after: { status: v.approve ? "EXCUSED (approved)" : "ABSENT (excuse rejected)" } }, tx);
    });
    done();
  });
}

/** Withdraws an approved excuse (administrator, with a reason): the day becomes an ordinary absence. */
export async function revokeExcuseAction(input: unknown) {
  return run(async () => {
    const v = z.object({ recordId: z.string().min(1).max(40), reason: REASON }).parse(input);
    const me = await requireUser();
    if (!can(me, "workers:manage") || !can(me, "attendance:approve")) throw new UserError("Only the administrator can revoke an approved excuse.");
    await db.$transaction(async (tx) => {
      const r = await tx.attendanceRecord.findUnique({ where: { id: v.recordId }, include: { worker: { select: { number: true, fullName: true } } } });
      if (!r || r.status !== "EXCUSED" || r.excuseState !== "APPROVED") throw new UserError("Only an approved excuse can be revoked.");
      await assertMonthOpen(tx, ymdDate(r.day));
      await tx.attendanceRecord.update({ where: { id: r.id }, data: { status: "ABSENT", excuseState: "REVOKED", decidedById: me.id, decidedAt: new Date(), decisionNote: v.reason } });
      await audit({ userId: me.id, action: "attendance.excuseRevoke", entityType: "AttendanceRecord", entityId: r.id, reason: v.reason,
        before: { worker: `${r.worker.number} ${r.worker.fullName}`, day: ymdDate(r.day), status: "EXCUSED (approved)" }, after: { status: "ABSENT (excuse revoked)" } }, tx);
    });
    done();
  });
}

/** Asks for extra deduction days on one actual absence (one request per absence). */
export async function requestExtraAction(input: unknown) {
  return run(async () => {
    const v = z.object({ recordId: z.string().min(1).max(40), days: z.coerce.number().int("Whole days only").min(1, "At least 1 day").max(10, "At most 10 days"), reason: REASON }).parse(input);
    const me = await requireUser();
    if (!can(me, "attendance:create") && !can(me, "attendance:approve")) throw new UserError("You don't have permission to do this.");
    await db.$transaction(async (tx) => {
      const r = await tx.attendanceRecord.findUnique({ where: { id: v.recordId }, include: { report: { select: { shift: true } }, worker: { select: { number: true, fullName: true } }, extra: true } });
      if (!r) throw new UserError("That attendance record no longer exists.");
      if (!can(me, "attendance:approve")) assertWork(await scopeOf(me, tx), r.report.shift);
      if (r.status !== "ABSENT") throw new UserError("Extra deduction days are only for an ordinary absence (not an excused one).");
      await assertMonthOpen(tx, ymdDate(r.day));
      if (r.extra && r.extra.state !== "REJECTED") throw new UserError("This absence already has extra deduction days.");
      const data = { workerId: r.workerId, days: v.days, reason: v.reason, state: "WAITING" as const, requestedById: me.id, requestedAt: new Date(), decidedById: null, decidedAt: null, decisionNote: null };
      if (r.extra) await tx.extraDeduction.update({ where: { id: r.extra.id }, data });
      else await tx.extraDeduction.create({ data: { recordId: r.id, ...data } });
      await audit({ userId: me.id, action: "attendance.extraAsk", entityType: "AttendanceRecord", entityId: r.id, reason: v.reason,
        after: { worker: `${r.worker.number} ${r.worker.fullName}`, day: ymdDate(r.day), actualAbsentDays: 1, extraDays: v.days, deductionDays: 1 + v.days } }, tx);
      await notify({ type: "attendance.extra", data: { name: r.worker.fullName, days: v.days, day: ymdDate(r.day), by: me.fullName }, link: "/workers/excuses", toPermission: "attendance:approve", exceptUserId: me.id }, tx);
    });
    done();
  });
}

/** Approves or rejects extra deduction days. */
export async function decideExtraAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(input);
    const me = await requirePermission("attendance:approve");
    await db.$transaction(async (tx) => {
      const x = await tx.extraDeduction.findUnique({ where: { id: v.id }, include: { record: true, worker: { select: { number: true, fullName: true } } } });
      if (!x || x.state !== "WAITING") throw new UserError("There is no request waiting here.");
      if (x.record.status !== "ABSENT") throw new UserError("The day is no longer an ordinary absence.");
      await assertMonthOpen(tx, ymdDate(x.record.day));
      await tx.extraDeduction.update({ where: { id: x.id }, data: { state: v.approve ? "APPROVED" : "REJECTED", decidedById: me.id, decidedAt: new Date(), decisionNote: v.note || null } });
      await audit({ userId: me.id, action: v.approve ? "attendance.extraApprove" : "attendance.extraReject", entityType: "AttendanceRecord", entityId: x.recordId, reason: v.note ?? x.reason,
        after: { worker: `${x.worker.number} ${x.worker.fullName}`, day: ymdDate(x.record.day), extraDays: x.days, state: v.approve ? "APPROVED" : "REJECTED" } }, tx);
    });
    done();
  });
}

const AMOUNT = z.coerce.number().positive("The amount must be more than 0").max(100_000_000).refine((n) => Number.isInteger(n), "Whole IQD only");

/** A money penalty (IQD) for an employee of the leader's own shift. */
export async function addPenaltyAction(input: unknown) {
  return run(async () => {
    const v = z.object({ workerId: z.string().min(1).max(40), amount: AMOUNT, reason: REASON, day: DAY, submissionId: z.string().optional() }).parse(input);
    const me = await requirePermission("penalties:create");
    if (v.day > todayYmd()) throw new UserError("The date can't be in the future.");
    const { result } = await once(submissionKey(v.submissionId), me.id, "penalty.add", async (tx) => {
      const w = await tx.worker.findUnique({ where: { id: v.workerId } });
      if (!w) throw new UserError("That employee no longer exists.");
      assertWork(await scopeOf(me, tx), w.shift);
      if (w.status !== "ACTIVE") throw new UserError("This employee is inactive.");
      await assertMonthOpen(tx, v.day);
      const p = await tx.penalty.create({ data: { workerId: w.id, shift: w.shift, day: dayDate(v.day), amount: v.amount, reason: v.reason, issuedById: me.id } });
      await audit({ userId: me.id, action: "penalty.add", entityType: "Penalty", entityId: p.id, reason: v.reason, after: { worker: `${w.number} ${w.fullName}`, shift: SHIFT_NO[w.shift], day: v.day, amount: v.amount } }, tx);
      return { id: p.id };
    });
    revalidatePath("/workers/penalties"); revalidatePath(`/workers/${v.workerId}`); revalidatePath("/workers/payroll");
    return result;
  });
}

/** Changes a penalty's amount or reason (the original is kept in the history), or cancels it — never deletes it. */
export async function changePenaltyAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), cancel: z.boolean().default(false), amount: AMOUNT.optional(), reason: z.string().trim().max(500).optional(), why: REASON }).parse(input);
    const me = await requirePermission("penalties:create");
    const p = await db.$transaction(async (tx) => {
      const p = await tx.penalty.findUnique({ where: { id: v.id }, include: { worker: { select: { number: true, fullName: true } } } });
      if (!p) throw new UserError("That penalty no longer exists.");
      assertWork(await scopeOf(me, tx), p.shift);
      if (p.state !== "ACTIVE") throw new UserError("This penalty was already cancelled.");
      await assertMonthOpen(tx, ymdDate(p.day));
      if (v.cancel) {
        await tx.penalty.update({ where: { id: p.id }, data: { state: "CANCELLED", cancelledById: me.id, cancelledAt: new Date(), cancelReason: v.why } });
      } else {
        if (v.amount === undefined && !v.reason) throw new UserError("Nothing was changed.");
        await tx.penalty.update({ where: { id: p.id }, data: { amount: v.amount ?? p.amount, reason: v.reason || p.reason } });
      }
      await audit({ userId: me.id, action: v.cancel ? "penalty.cancel" : "penalty.change", entityType: "Penalty", entityId: p.id, reason: v.why,
        before: { worker: `${p.worker.number} ${p.worker.fullName}`, day: ymdDate(p.day), amount: Number(p.amount), reason: p.reason, state: "ACTIVE" },
        after: v.cancel ? { state: "CANCELLED" } : { amount: v.amount ?? Number(p.amount), reason: v.reason || p.reason } }, tx);
      return p;
    });
    revalidatePath("/workers/penalties"); revalidatePath(`/workers/${p.workerId}`); revalidatePath("/workers/payroll");
  });
}
