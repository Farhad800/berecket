import Link from "next/link";
import type { Shift } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { Printer } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFTS, SHIFT_NO } from "@/lib/workers";
import { payrollView } from "@/lib/payroll-view";
import { todayYmd } from "@/lib/production";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { correctPayrollLineAction, decidePayrollAction, finalizePayrollAction, submitPayrollAction } from "@/app/actions/payroll";
import WorkersNav from "../workers-nav";
import ActForm from "../act-form";

export const metadata = { title: "Monthly payroll" };
const iqd = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });
const STATE_TONE = { DRAFT: "gray", SUBMITTED: "amber", APPROVED: "blue", FINALIZED: "green" } as const;

/** The month's salaries: review, totals per shift and for all shifts, then submit → approve → finalize. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; shift?: string; q?: string }> }) {
  const me = await pageUser("payroll:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const now = todayYmd();
  const year = Number(sp.year) >= 2024 && Number(sp.year) <= 2100 ? Number(sp.year) : Number(now.slice(0, 4));
  const month = Number(sp.month) >= 1 && Number(sp.month) <= 12 ? Number(sp.month) : Number(now.slice(5, 7));
  const shift = (SHIFTS as readonly string[]).includes(sp.shift ?? "") ? (sp.shift as Shift) : undefined;
  const { run, frozen, lines: all, missing } = await payrollView(year, month, { shift });
  const q = sp.q?.trim().toLowerCase();
  const lines = q ? all.filter((l) => l.name.toLowerCase().includes(q) || l.number.toLowerCase().includes(q)) : all;
  const users = await db.user.findMany({ where: { id: { in: [run?.submittedById, run?.approvedById, run?.finalizedById].filter((x): x is string => !!x) } }, select: { id: true, fullName: true } });
  const who = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";
  const state = run?.state ?? "DRAFT";
  const sum = (ls: typeof lines, k: "finalSalary" | "absenceDeduction" | "penaltyTotal") => ls.reduce((s, l) => s + l[k], 0);
  const shownShifts = shift ? [shift] : SHIFTS.filter((s) => all.some((l) => l.shift === s));
  const years = Array.from({ length: 4 }, (_, i) => Number(now.slice(0, 4)) - i);
  const waiting = all.reduce((s, l) => s + l.waitingExcuses + l.waitingExtra, 0);
  const qs = `year=${year}&month=${month}`;

  return (
    <>
      <PageHeader title={t("wk.tab.payroll")} subtitle={t("wk.payrollIntro")} actions={<LinkButton href={`/workers/payroll/sheets?${qs}`} variant="secondary"><Printer className="size-4" /> {t("wk.tab.sheets")}</LinkButton>} />
      <WorkersNav me={me} active="payroll" />
      <ListToolbar placeholder={t("wk.search")} filters={[
        { name: "year", label: String(year), options: years.map((y) => ({ value: String(y), label: String(y) })) },
        { name: "month", label: t("wk.monthN", { n: month }), options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: t("wk.monthN", { n: i + 1 }) })) },
        { name: "shift", label: t("wk.allShifts"), options: SHIFTS.map((s) => ({ value: s, label: t("wk.shiftN", { n: SHIFT_NO[s] }) })) },
      ]} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{t("wk.payrollOf", { month, year })} <Badge tone={STATE_TONE[state]} className="ms-2">{t(`wk.run.${state}`)}</Badge></p>
            <p className="text-xs text-muted">{frozen ? t("wk.frozenNote") : t("wk.liveNote")}</p>
            {run?.submittedAt && <p className="text-xs text-muted">{t("wk.runSubmitted", { name: who(run.submittedById), at: formatDateTime(run.submittedAt, locale) })}</p>}
            {run?.approvedAt && <p className="text-xs text-muted">{t("wk.runApproved", { name: who(run.approvedById), at: formatDateTime(run.approvedAt, locale) })}</p>}
            {run?.finalizedAt && <p className="text-xs text-muted">{t("wk.runFinalized", { name: who(run.finalizedById), at: formatDateTime(run.finalizedAt, locale) })}</p>}
            {state === "DRAFT" && run?.rejectNote && <p className="text-sm text-red-600">{t("wk.sentBack")}: {run.rejectNote}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {state === "DRAFT" && can(me, "payroll:create") && <ActForm action={submitPayrollAction} payload={{ year, month }} submit={t("wk.submitPayroll")} />}
            {state === "SUBMITTED" && can(me, "payroll:approve") && <>
              <ActForm action={decidePayrollAction} payload={{ runId: run!.id, approve: true }} submit={t("wk.approvePayroll")} />
              <ActForm action={decidePayrollAction} payload={{ runId: run!.id, approve: false }} open={false} openLabel={t("wk.sendBack")} submit={t("wk.sendBack")} variant="danger" fields={[{ name: "note", label: t("wk.reason"), required: true }]} />
            </>}
            {state === "APPROVED" && can(me, "payroll:manage") && <ActForm action={finalizePayrollAction} payload={{ runId: run!.id }} submit={t("wk.finalize")} />}
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-4" data-testid="totals">
        <Card><p className="text-xs text-muted">{t("wk.employeesN")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{all.length}</p></Card>
        <Card><p className="text-xs text-muted">{t("wk.totalAbsence")}</p><p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{iqd(sum(all, "absenceDeduction"))}</p></Card>
        <Card><p className="text-xs text-muted">{t("wk.totalPenalties")}</p><p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{iqd(sum(all, "penaltyTotal"))}</p></Card>
        <Card><p className="text-xs text-muted">{t("wk.totalPayable")}</p><p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr" data-testid="total-payable">{iqd(sum(all, "finalSalary"))} IQD</p></Card>
      </div>

      {(waiting > 0 || shownShifts.some((s) => missing[s].length)) && (
        <Card className="mb-4" data-testid="review">
          <h2 className="mb-2 font-semibold">{t("wk.review")}</h2>
          {shownShifts.map((s) => missing[s].length > 0 && <p key={s} className="text-sm"><b>{t("wk.shiftN", { n: SHIFT_NO[s] })}</b>: {t("wk.missingDays", { n: missing[s].length })} <span className="text-xs text-muted" dir="ltr">{missing[s].map((d) => Number(d.slice(8))).join(", ")}</span> · <Link href={`/workers/attendance?shift=${s}&day=${missing[s][0]}`} className="text-brand-600">{t("wk.open")}</Link></p>)}
          {waiting > 0 && <p className="text-sm">{t("wk.waitingDecisions", { n: waiting })} · <Link href="/workers/excuses" className="text-brand-600">{t("wk.open")}</Link></p>}
          <p className="mt-1 text-xs text-muted">{t("wk.reviewHint")}</p>
        </Card>
      )}

      {shownShifts.map((s) => {
        const ls = lines.filter((l) => l.shift === s);
        if (!ls.length) return null;
        return (
          <Card key={s} className="mb-4 p-0 sm:p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-semibold">{t("wk.shiftN", { n: SHIFT_NO[s] })}</h2>
              <span className="flex items-center gap-3 text-sm"><span>{t("wk.shiftTotal")}: <b dir="ltr" data-testid={`shift-total-${SHIFT_NO[s]}`}>{iqd(sum(ls, "finalSalary"))} IQD</b></span>
                <Link href={`/print/salary-sheet?${qs}&shift=${s}`} target="_blank" className="font-semibold text-brand-600 hover:underline">{t("wk.printSheet")}</Link></span>
            </div>
            <div className="table-wrap">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-muted">
                  <tr>{["employee", "salary", "daysWorked", "absent", "excused", "extra", "deductionDays", "dailyRate", "absenceDed", "penalties", "totalDed", "final"].map((k) => <th key={k} className={`px-2 py-2 ${k === "employee" ? "text-start" : "text-end"}`}>{t(`wk.col.${k}`)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ls.map((l) => (
                    <tr key={l.workerId} data-testid={`pay-${l.number}`}>
                      <td className="px-2 py-2"><Link href={`/workers/${l.workerId}`} className="font-semibold hover:underline">{l.name}</Link><div className="text-muted" dir="ltr">{l.number}{l.eligibleDays < 30 && ` · ${t("wk.paidDays", { n: l.eligibleDays })}`}</div>
                        {(l.waitingExcuses + l.waitingExtra > 0) && <Badge tone="amber">{t("wk.waiting")}</Badge>}{l.corrected && <Badge tone="blue">{t("wk.correctedBadge")}</Badge>}</td>
                      <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{iqd(l.salary)}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{l.daysWorked}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{l.absentDays}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{l.excusedDays}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{l.extraDays}</td>
                      <td className="px-2 py-2 text-end font-semibold tabular-nums">{l.deductionDays}</td>
                      <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{l.dailyRate.toLocaleString("en", { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{iqd(l.absenceDeduction)}</td>
                      <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{iqd(l.penaltyTotal)}{l.penaltyCount > 0 && ` (${l.penaltyCount})`}</td>
                      <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{iqd(l.totalDeductions)}</td>
                      <td className="px-2 py-2 text-end text-sm font-bold tabular-nums" dir="ltr" data-testid={`final-${l.number}`}>{iqd(l.finalSalary)}
                        {state === "FINALIZED" && l.id && can(me, "payroll:manage") && <div className="mt-1 text-start font-normal"><ActForm action={correctPayrollLineAction} payload={{ lineId: l.id }} open={false} openLabel={t("wk.correctLine")} submit={t("common.save")} fields={[
                          { name: "daysWorked", label: t("wk.col.daysWorked"), type: "number", required: true, defaultValue: String(l.daysWorked) },
                          { name: "finalSalary", label: t("wk.col.final"), type: "number", required: true, defaultValue: String(l.finalSalary) },
                          { name: "reason", label: t("wk.reason"), required: true, wide: true },
                        ]} /></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {lines.length === 0 && <Alert tone="blue">{t("wk.noPayroll")}</Alert>}
      <p className="text-xs text-muted">{t("wk.formula")}</p>
    </>
  );
}
