/**
 * Monthly salary (owner, 31 Oct 2026) — pure functions, no database.
 *
 * - Every month is paid on 30 days: daily rate = monthly salary ÷ 30 (never rounded early).
 * - Pay days are 1–30. In a 31-day month the 31st is not counted; a month shorter than 30 days still pays 30
 *   (someone employed to its last calendar day is paid to day 30).
 * - Joining on the 10th → paid days 10–30 = 21; last day on the 12th → paid days 1–12 = 12.
 * - Deduction days = ordinary absences + approved extra deduction days. Approved or waiting excuses never deduct.
 * - Days with no attendance report count as worked and are listed as "not submitted" — never deducted.
 * - Final salary = daily rate × paid days − daily rate × deduction days − penalties, rounded once to 250 IQD.
 */
export const PAY_DAYS = 30;
export const ROUND_TO = 250;

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
export const roundIqd = (n: number) => Math.round(n / ROUND_TO) * ROUND_TO;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The pay days (1–30) a worker is employed in this month: [from, to], or null when none. */
export function paidRange(year: number, month: number, startYmd: string, endYmd: string | null): [number, number] | null {
  const first = ymd(year, month, 1), dim = daysInMonth(year, month), last = ymd(year, month, dim);
  if (startYmd > last) return null;
  if (endYmd && endYmd < first) return null;
  const from = startYmd < first ? 1 : Number(startYmd.slice(8, 10));
  // employed to the month's last calendar day (or beyond) = paid to day 30
  const to = !endYmd || endYmd >= last ? PAY_DAYS : Math.min(Number(endYmd.slice(8, 10)), PAY_DAYS);
  if (from > PAY_DAYS || from > to) return null;
  return [from, to];
}

export type DayRecord = { day: string; status: "PRESENT" | "ABSENT" | "EXCUSED"; extraDays: number /* approved extra deduction days on this absence */ };

export type PayInput = {
  year: number; month: number;
  salary: number; startYmd: string; endYmd: string | null;
  records: DayRecord[];
  penalties: number[]; // active penalty amounts in this calendar month
  reportedDays: Set<string>; // days of the month that have an attendance report for the worker's shift
  todayYmd: string; // days after today are not "missing" yet
};

export type PayResult = {
  dailyRate: number; eligibleDays: number; daysWorked: number;
  absentDays: number; excusedDays: number; extraDays: number; deductionDays: number; notSubmittedDays: number;
  earned: number; absenceDeduction: number; penaltyCount: number; penaltyTotal: number; totalDeductions: number; finalSalary: number;
};

export function payFor(p: PayInput): PayResult | null {
  const range = paidRange(p.year, p.month, p.startYmd, p.endYmd);
  if (!range) return null;
  const [from, to] = range;
  const inRange = (day: string) => { const d = Number(day.slice(8, 10)); return d >= from && d <= to && d <= PAY_DAYS; };
  const recs = p.records.filter((r) => inRange(r.day));
  const absentDays = recs.filter((r) => r.status === "ABSENT").length;
  const excusedDays = recs.filter((r) => r.status === "EXCUSED").length;
  const extraDays = recs.filter((r) => r.status === "ABSENT").reduce((s, r) => s + Math.max(0, r.extraDays), 0);
  const eligibleDays = to - from + 1;
  const deductionDays = absentDays + extraDays;
  // missing reports: real calendar days in the paid range, up to today, with no report for the shift
  const dim = daysInMonth(p.year, p.month);
  let notSubmittedDays = 0;
  for (let d = from; d <= Math.min(to, dim); d++) {
    const day = ymd(p.year, p.month, d);
    if (day <= p.todayYmd && !p.reportedDays.has(day)) notSubmittedDays++;
  }
  const dailyRate = p.salary / PAY_DAYS;
  const earned = dailyRate * eligibleDays;
  const absenceDeduction = dailyRate * deductionDays;
  const penaltyTotal = p.penalties.reduce((s, a) => s + a, 0);
  return {
    dailyRate, eligibleDays, daysWorked: Math.max(0, eligibleDays - absentDays - excusedDays),
    absentDays, excusedDays, extraDays, deductionDays, notSubmittedDays,
    earned: r2(earned), absenceDeduction: r2(absenceDeduction), penaltyCount: p.penalties.length, penaltyTotal: r2(penaltyTotal),
    totalDeductions: r2(absenceDeduction + penaltyTotal), finalSalary: roundIqd(earned - absenceDeduction - penaltyTotal),
  };
}
