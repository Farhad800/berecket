import "server-only";
import type { Shift } from "@prisma/client";
import { db } from "./db";
import { computeMonth } from "./workers";

/** One worker's payroll line as shown and printed: frozen figures once submitted, live figures while Draft. */
export type ViewLine = {
  id: string | null; workerId: string; number: string; name: string; shift: Shift; salary: number; dailyRate: number;
  eligibleDays: number; daysWorked: number; absentDays: number; excusedDays: number; extraDays: number; deductionDays: number; notSubmittedDays: number;
  absenceDeduction: number; penaltyCount: number; penaltyTotal: number; totalDeductions: number; finalSalary: number;
  waitingExcuses: number; waitingExtra: number; corrected: boolean;
};

export async function payrollView(year: number, month: number, filter: { shift?: Shift } = {}) {
  const runRow = await db.payrollRun.findUnique({ where: { year_month: { year, month } } });
  const frozen = !!runRow && runRow.state !== "DRAFT";
  const { rows, missing } = await computeMonth(year, month, filter); // missing reports are always shown as they stand now
  let lines: ViewLine[];
  if (frozen) {
    const stored = await db.payrollLine.findMany({ where: { runId: runRow!.id, ...(filter.shift ? { shift: filter.shift } : {}) }, orderBy: [{ shift: "asc" }, { workerName: "asc" }], include: { _count: { select: { corrections: true } } } });
    lines = stored.map((l) => ({
      id: l.id, workerId: l.workerId, number: l.workerNumber, name: l.workerName, shift: l.shift, salary: Number(l.salary), dailyRate: Number(l.dailyRate),
      eligibleDays: l.eligibleDays, daysWorked: l.daysWorked, absentDays: l.absentDays, excusedDays: l.excusedDays, extraDays: l.extraDays, deductionDays: l.deductionDays,
      notSubmittedDays: l.notSubmittedDays, absenceDeduction: Number(l.absenceDeduction), penaltyCount: l.penaltyCount, penaltyTotal: Number(l.penaltyTotal),
      totalDeductions: Number(l.totalDeductions), finalSalary: Number(l.finalSalary), waitingExcuses: 0, waitingExtra: 0, corrected: l._count.corrections > 0,
    }));
  } else {
    lines = rows.sort((a, b) => a.shift.localeCompare(b.shift) || a.name.localeCompare(b.name)).map((r) => ({
      id: null, workerId: r.workerId, number: r.number, name: r.name, shift: r.shift, salary: r.salary, dailyRate: r.dailyRate,
      eligibleDays: r.eligibleDays, daysWorked: r.daysWorked, absentDays: r.absentDays, excusedDays: r.excusedDays, extraDays: r.extraDays, deductionDays: r.deductionDays,
      notSubmittedDays: r.notSubmittedDays, absenceDeduction: r.absenceDeduction, penaltyCount: r.penaltyCount, penaltyTotal: r.penaltyTotal,
      totalDeductions: r.totalDeductions, finalSalary: r.finalSalary, waitingExcuses: r.waitingExcuses, waitingExtra: r.waitingExtra, corrected: false,
    }));
  }
  return { run: runRow, frozen, lines, missing };
}
