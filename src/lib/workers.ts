import "server-only";
import type { Shift } from "@prisma/client";
import { db, type Tx } from "./db";
import { can, type CurrentUser } from "./auth";
import { UserError } from "./action";
import { payFor, ymd, daysInMonth, type DayRecord, type PayResult } from "./payroll-math";
import { todayYmd } from "./production";

/**
 * Factory workers, shifts and who may see what (owner, 31 Oct 2026).
 * Shift 1 / 2 / 3 are the production shifts A / B / C.
 *
 * - A team leader (the user named for a shift) works only with that shift's workers.
 * - `workers:manage` (administrator) works with every shift.
 * - `payroll:view` (accountant, manager) reads every shift and sees salaries.
 * - Salaries are shown only with `payroll:view` or `workers:salary` — never to a team leader.
 */
export const SHIFTS = ["A", "B", "C"] as const satisfies readonly Shift[];
export const SHIFT_NO: Record<Shift, number> = { A: 1, B: 2, C: 3 };
export const DEFAULT_SALARY = 400_000;

/** Digits only, without the country code or a leading 0: "+964 750 111 2222" and "0750-111-2222" match. */
export function phoneKey(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  return d.replace(/^0+/, "");
}

/** Names compared without case, extra spaces or Arabic letter variants. */
export function nameKey(name: string) {
  return name.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
}

export type Scope = { all: boolean; manage: boolean; leads: Shift[]; shifts: Shift[]; salary: boolean };

/** Which shifts this user can see and work with. */
export async function scopeOf(me: CurrentUser, tx: Tx = db): Promise<Scope> {
  const manage = can(me, "workers:manage");
  const readAll = manage || can(me, "payroll:view");
  const leads = (await tx.shiftLeader.findMany({ where: { userId: me.id }, select: { shift: true } })).map((l) => l.shift);
  return { all: readAll, manage, leads, shifts: readAll ? [...SHIFTS] : leads, salary: can(me, "payroll:view") || can(me, "workers:salary") };
}

/** May this user change records of this shift (attendance, penalties, departures)? Leaders: own shift only. */
export function mayWork(scope: Scope, shift: Shift) {
  return scope.manage || scope.leads.includes(shift);
}

export function assertWork(scope: Scope, shift: Shift) {
  if (!mayWork(scope, shift)) throw new UserError(`You can only work with your own shift's employees (shift ${SHIFT_NO[shift]}).`);
}

export function assertSee(scope: Scope, shift: Shift) {
  if (!scope.shifts.includes(shift)) throw new UserError("That employee is not in your shift.");
}

export const dayDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const ymdDate = (d: Date) => d.toISOString().slice(0, 10);

/** Salary in force on the 1st of the month (a change during the month applies from the next month). */
export function salaryOn(worker: { salary: unknown; salaryChanges: { oldSalary: unknown; newSalary: unknown; createdAt: Date }[] }, monthStart: Date) {
  const changes = [...worker.salaryChanges].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const later = changes.find((c) => c.createdAt >= monthStart);
  return Number(later ? later.oldSalary : worker.salary);
}

export type PayRow = PayResult & { workerId: string; number: string; name: string; shift: Shift; salary: number; status: string; waitingExcuses: number; waitingExtra: number };

/**
 * Works out the month for every worker employed in it (optionally one shift / one worker).
 * Attendance, excuses, extra days and penalties are read as they stand now.
 */
export async function computeMonth(year: number, month: number, filter: { shift?: Shift; workerId?: string } = {}, tx: Tx = db): Promise<{ rows: PayRow[]; missing: Record<Shift, string[]> }> {
  const first = ymd(year, month, 1), last = ymd(year, month, daysInMonth(year, month));
  const monthStart = new Date(`${first}T00:00:00+03:00`);
  const workers = await tx.worker.findMany({
    where: {
      startDate: { lte: dayDate(last) },
      OR: [{ endDate: null }, { endDate: { gte: dayDate(first) } }],
      ...(filter.shift ? { shift: filter.shift } : {}),
      ...(filter.workerId ? { id: filter.workerId } : {}),
    },
    orderBy: [{ shift: "asc" }, { number: "asc" }],
    include: { salaryChanges: { select: { oldSalary: true, newSalary: true, createdAt: true } } },
  });
  const ids = workers.map((w) => w.id);
  const [records, penalties, reports] = await Promise.all([
    tx.attendanceRecord.findMany({
      where: { workerId: { in: ids }, day: { gte: dayDate(first), lte: dayDate(last) } },
      select: { workerId: true, day: true, status: true, excuseState: true, extra: { select: { days: true, state: true } } },
    }),
    tx.penalty.findMany({ where: { workerId: { in: ids }, state: "ACTIVE", day: { gte: dayDate(first), lte: dayDate(last) } }, select: { workerId: true, amount: true } }),
    tx.attendanceReport.findMany({ where: { day: { gte: dayDate(first), lte: dayDate(last) } }, select: { shift: true, day: true } }),
  ]);
  const reported: Record<Shift, Set<string>> = { A: new Set(), B: new Set(), C: new Set() };
  for (const r of reports) reported[r.shift].add(ymdDate(r.day));
  const today = todayYmd();
  const missing = { A: [], B: [], C: [] } as Record<Shift, string[]>;
  for (const s of SHIFTS) for (let d = 1; d <= daysInMonth(year, month); d++) { const day = ymd(year, month, d); if (day <= today && !reported[s].has(day)) missing[s].push(day); }

  const rows: PayRow[] = [];
  for (const w of workers) {
    const recs = records.filter((r) => r.workerId === w.id);
    const dayRecs: DayRecord[] = recs.map((r) => ({ day: ymdDate(r.day), status: r.status, extraDays: r.extra?.state === "APPROVED" ? r.extra.days : 0 }));
    const salary = salaryOn(w, monthStart);
    const res = payFor({
      year, month, salary, startYmd: ymdDate(w.startDate), endYmd: w.endDate ? ymdDate(w.endDate) : null, records: dayRecs,
      penalties: penalties.filter((p) => p.workerId === w.id).map((p) => Number(p.amount)), reportedDays: reported[w.shift], todayYmd: today,
    });
    if (!res) continue;
    rows.push({
      ...res, workerId: w.id, number: w.number, name: w.fullName, shift: w.shift, salary, status: w.status,
      waitingExcuses: recs.filter((r) => r.status === "EXCUSED" && r.excuseState === "WAITING").length,
      waitingExtra: recs.filter((r) => r.extra?.state === "WAITING").length,
    });
  }
  return { rows, missing };
}

/** Payroll for that month must still be open (not submitted, approved or finalized). */
export async function assertMonthOpen(tx: Tx, day: string) {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const run = await tx.payrollRun.findUnique({ where: { year_month: { year: y, month: m } }, select: { state: true } });
  if (run && run.state !== "DRAFT") throw new UserError(`The payroll for ${m}/${y} is already ${run.state === "FINALIZED" ? "finalized — a change now needs a payroll correction" : "submitted — ask the manager to send it back first"}.`);
}

