"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { run, UserError } from "@/lib/action";
import { assertSalaries, computeMonth } from "@/lib/workers";
import { todayYmd } from "@/lib/production";
import { roundIqd } from "@/lib/payroll-math";

/**
 * Monthly payroll workflow (owner, 31 Oct 2026): Draft (live figures) → Submitted (figures frozen) →
 * Approved by the manager (or sent back) → Finalized by the administrator (locked for good).
 * No step moves any money: paying salaries from a safe is a separate feature.
 */
const MONTH = z.object({ year: z.coerce.number().int().min(2024).max(2100), month: z.coerce.number().int().min(1).max(12) });
const done = () => { for (const p of ["/workers/payroll", "/workers/payroll/history"]) revalidatePath(p); };
const iqd = (n: number) => `${n.toLocaleString("en", { maximumFractionDigits: 0 })} IQD`;

/** The accountant sends the month to the manager: the figures are worked out once more and frozen. */
export async function submitPayrollAction(input: unknown) {
  return run(async () => {
    const v = MONTH.parse(input);
    const me = await requirePermission("payroll:create");
    assertSalaries(me, "payroll:create");
    if (`${v.year}-${String(v.month).padStart(2, "0")}` > todayYmd().slice(0, 7)) throw new UserError("A future month can't be submitted.");
    const res = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"payroll:" + v.year + ":" + v.month}))`;
      const existing = await tx.payrollRun.findUnique({ where: { year_month: { year: v.year, month: v.month } } });
      if (existing && existing.state !== "DRAFT") throw new UserError(`This month's payroll is already ${existing.state.toLowerCase()}.`);
      const { rows } = await computeMonth(v.year, v.month, {}, tx);
      if (!rows.length) throw new UserError("No employees were employed in this month.");
      const runRow = existing
        ? await tx.payrollRun.update({ where: { id: existing.id }, data: { state: "SUBMITTED", submittedById: me.id, submittedAt: new Date(), approvedById: null, approvedAt: null } })
        : await tx.payrollRun.create({ data: { year: v.year, month: v.month, state: "SUBMITTED", createdById: me.id, submittedById: me.id, submittedAt: new Date() } });
      await tx.payrollLine.deleteMany({ where: { runId: runRow.id } });
      await tx.payrollLine.createMany({ data: rows.map((r) => ({
        runId: runRow.id, workerId: r.workerId, workerNumber: r.number, workerName: r.name, shift: r.shift, salary: r.salary, dailyRate: r.dailyRate,
        eligibleDays: r.eligibleDays, daysWorked: r.daysWorked, absentDays: r.absentDays, excusedDays: r.excusedDays, extraDays: r.extraDays, deductionDays: r.deductionDays,
        notSubmittedDays: r.notSubmittedDays, earned: r.earned, absenceDeduction: r.absenceDeduction, penaltyCount: r.penaltyCount, penaltyTotal: r.penaltyTotal,
        totalDeductions: r.totalDeductions, finalSalary: r.finalSalary,
      })) });
      const total = rows.reduce((s, r) => s + r.finalSalary, 0);
      await audit({ userId: me.id, action: "payroll.submit", entityType: "PayrollRun", entityId: runRow.id, after: { month: `${v.month}/${v.year}`, employees: rows.length, total: iqd(total) } }, tx);
      await notify({ type: "payroll.submitted", data: { month: `${v.month}/${v.year}`, n: rows.length, by: me.fullName }, link: `/workers/payroll?year=${v.year}&month=${v.month}`, toPermission: "payroll:approve", exceptUserId: me.id }, tx);
      return { id: runRow.id, employees: rows.length, total };
    }, { timeout: 60_000 });
    done();
    return res;
  });
}

/** The manager approves the submitted payroll, or sends it back to Draft with a reason (the frozen figures are dropped). */
export async function decidePayrollAction(input: unknown) {
  return run(async () => {
    const v = z.object({ runId: z.string().min(1).max(40), approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(input);
    const me = await requirePermission("payroll:approve");
    assertSalaries(me, "payroll:approve");
    if (!v.approve && (v.note ?? "").length < 3) throw new UserError("Write why the payroll is sent back.");
    await db.$transaction(async (tx) => {
      const r = await tx.payrollRun.findUnique({ where: { id: v.runId } });
      if (!r || r.state !== "SUBMITTED") throw new UserError("There is no submitted payroll waiting here.");
      if (v.approve) await tx.payrollRun.update({ where: { id: r.id }, data: { state: "APPROVED", approvedById: me.id, approvedAt: new Date(), rejectNote: null } });
      else {
        await tx.payrollLine.deleteMany({ where: { runId: r.id } });
        await tx.payrollRun.update({ where: { id: r.id }, data: { state: "DRAFT", rejectNote: v.note!, submittedById: null, submittedAt: null } });
      }
      await audit({ userId: me.id, action: v.approve ? "payroll.approve" : "payroll.reject", entityType: "PayrollRun", entityId: r.id, reason: v.note ?? null, after: { month: `${r.month}/${r.year}` } }, tx);
      await notify({ type: v.approve ? "payroll.approved" : "payroll.rejected", data: { month: `${r.month}/${r.year}`, by: me.fullName, note: v.note ?? "" }, link: `/workers/payroll?year=${r.year}&month=${r.month}`, toPermission: "payroll:create", exceptUserId: me.id }, tx);
    });
    done();
  });
}

/** The administrator finalizes an approved payroll: its figures never change again (only by a recorded correction). */
export async function finalizePayrollAction(input: unknown) {
  return run(async () => {
    const v = z.object({ runId: z.string().min(1).max(40) }).parse(input);
    const me = await requirePermission("payroll:manage");
    assertSalaries(me, "payroll:manage");
    await db.$transaction(async (tx) => {
      const r = await tx.payrollRun.findUnique({ where: { id: v.runId }, include: { _count: { select: { lines: true } } } });
      if (!r || r.state !== "APPROVED") throw new UserError("Only an approved payroll can be finalized.");
      await tx.payrollRun.update({ where: { id: r.id }, data: { state: "FINALIZED", finalizedById: me.id, finalizedAt: new Date() } });
      await audit({ userId: me.id, action: "payroll.finalize", entityType: "PayrollRun", entityId: r.id, after: { month: `${r.month}/${r.year}`, employees: r._count.lines } }, tx);
    });
    done();
  });
}

/** Corrects one finalized line (administrator, with a reason). The original figures are kept beside the new ones. */
export async function correctPayrollLineAction(input: unknown) {
  return run(async () => {
    const v = z.object({
      lineId: z.string().min(1).max(40),
      daysWorked: z.coerce.number().int().min(0).max(30),
      finalSalary: z.coerce.number().min(0).max(100_000_000),
      reason: z.string().trim().min(3, "Write the reason").max(500),
    }).parse(input);
    const me = await requirePermission("payroll:manage");
    assertSalaries(me, "payroll:manage");
    await db.$transaction(async (tx) => {
      const l = await tx.payrollLine.findUnique({ where: { id: v.lineId }, include: { run: true } });
      if (!l) throw new UserError("That payroll line no longer exists.");
      if (l.run.state !== "FINALIZED") throw new UserError("Only a finalized payroll is corrected this way; before that the figures are worked out again on submit.");
      const finalSalary = roundIqd(v.finalSalary);
      const before = { daysWorked: l.daysWorked, finalSalary: Number(l.finalSalary) };
      const after = { daysWorked: v.daysWorked, finalSalary };
      if (before.daysWorked === after.daysWorked && before.finalSalary === after.finalSalary) throw new UserError("Nothing was changed.");
      await tx.payrollCorrection.create({ data: { lineId: l.id, before, after, reason: v.reason, byId: me.id } });
      await tx.payrollLine.update({ where: { id: l.id }, data: after });
      await audit({ userId: me.id, action: "payroll.correct", entityType: "PayrollRun", entityId: l.runId, reason: v.reason,
        before: { month: `${l.run.month}/${l.run.year}`, worker: `${l.workerNumber} ${l.workerName}`, ...before }, after: { ...after } }, tx);
    });
    done();
  });
}
