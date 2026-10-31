import Link from "next/link";
import type { Shift } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFT_NO, dayDate, mayWork, scopeOf, ymdDate } from "@/lib/workers";
import { daysInMonth, ymd } from "@/lib/payroll-math";
import { todayYmd } from "@/lib/production";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, PageHeader, cn } from "@/components/ui";
import WorkersNav from "../workers-nav";
import AttendanceForm from "./attendance-form";

export const metadata = { title: "Daily attendance" };

/** The day's report for one shift (submit or correct), and the month at a glance with every Not Submitted day. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ shift?: string; day?: string }> }) {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const scope = await scopeOf(me);
  const today = todayYmd();
  const shift = (scope.shifts.includes(sp.shift as Shift) ? sp.shift : scope.leads[0] ?? scope.shifts[0]) as Shift | undefined;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  if (!shift) return (<><PageHeader title={t("wk.tab.attendance")} /><WorkersNav me={me} active="attendance" /><Alert tone="amber">{t("wk.noShift")}</Alert></>);
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const [report, monthReports, users] = await Promise.all([
    db.attendanceReport.findUnique({ where: { shift_day: { shift, day: dayDate(day) } }, include: { records: { include: { worker: { select: { number: true, fullName: true } } }, orderBy: { worker: { fullName: "asc" } } } } }),
    db.attendanceReport.findMany({ where: { shift: { in: scope.shifts }, day: { gte: dayDate(ymd(y, m, 1)), lte: dayDate(ymd(y, m, daysInMonth(y, m))) } }, include: { records: { select: { status: true } } } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  const who = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";
  const work = mayWork(scope, shift);
  const workers = report ? [] : await db.worker.findMany({ where: { shift, status: "ACTIVE", startDate: { lte: dayDate(day) } }, orderBy: { fullName: "asc" }, select: { id: true, number: true, fullName: true } });
  const href = (s: string, d: string) => `/workers/attendance?shift=${s}&day=${d}`;
  const prevMonth = m === 1 ? ymd(y - 1, 12, 1) : ymd(y, m - 1, 1);
  const nextMonth = m === 12 ? ymd(y + 1, 1, 1) : ymd(y, m + 1, 1);
  const counts = report && {
    present: report.records.filter((r) => r.status === "PRESENT").length, absent: report.records.filter((r) => r.status === "ABSENT").length,
    excused: report.records.filter((r) => r.status === "EXCUSED").length, total: report.records.length,
  };

  return (
    <>
      <PageHeader title={t("wk.tab.attendance")} subtitle={t("wk.attIntro")} />
      <WorkersNav me={me} active="attendance" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {scope.shifts.map((s) => <Link key={s} href={href(s, day)} className={cn("min-h-10 rounded-full border px-4 py-2 text-sm font-semibold", s === shift ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface")}>{t("wk.shiftN", { n: SHIFT_NO[s] })}</Link>)}
        <form action="/workers/attendance" className="flex items-center gap-2">
          <input type="hidden" name="shift" value={shift} />
          <input type="date" name="day" defaultValue={day} max={today} className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm" aria-label={t("wk.date")} dir="ltr" />
          <button className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-semibold">{t("prod.show")}</button>
        </form>
      </div>

      <h2 className="mb-2 text-lg font-semibold">{t("wk.reportFor", { shift: SHIFT_NO[shift], date: day })}</h2>
      {report ? (
        <>
          <Card className="mb-3" data-testid="report-done">
            <p className="text-sm"><Badge tone="green">{t("wk.submittedBadge")}</Badge> {t("wk.submittedBy", { name: who(report.submittedById), at: formatDateTime(report.submittedAt, locale) })}{report.correctedAt && ` · ${t("wk.correctedAt", { at: formatDateTime(report.correctedAt, locale) })}`}</p>
            <p className="mt-2 text-sm" data-testid="report-counts">{t("wk.countLine", counts!)}</p>
            <ul className="mt-2 text-sm">
              {report.records.filter((r) => r.status !== "PRESENT").map((r) => <li key={r.id}>{r.worker.fullName} — <b>{t(`wk.att.${r.status}`)}</b>{r.excuseState && ` (${t(`wk.excuse.${r.excuseState}`)})`}{r.excuseReason && `: ${r.excuseReason}`}</li>)}
            </ul>
          </Card>
          {work && can(me, "attendance:edit") && (
            <details className="mb-6">
              <summary className="cursor-pointer text-sm font-semibold text-brand-600">{t("wk.correct")}</summary>
              <div className="mt-3"><AttendanceForm shift={shift} day={day} reportId={report.id}
                workers={report.records.map((r) => ({ id: r.workerId, number: r.worker.number, name: r.worker.fullName }))}
                initial={Object.fromEntries(report.records.filter((r) => r.status !== "PRESENT").map((r) => [r.workerId, { status: r.status as "ABSENT" | "EXCUSED", reason: r.excuseReason ?? "" }]))} /></div>
            </details>
          )}
        </>
      ) : work && can(me, "attendance:create") ? (
        workers.length ? <AttendanceForm shift={shift} day={day} workers={workers.map((w) => ({ id: w.id, number: w.number, name: w.fullName }))} /> : <Alert tone="amber">{t("wk.noActive")}</Alert>
      ) : <div className="mb-6"><Alert tone="amber">{t("wk.notSubmitted")}</Alert></div>}

      <Card className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">{t("wk.monthView", { month: `${m}/${y}` })}</h2>
          <span className="flex gap-3 text-sm"><Link href={href(shift, prevMonth)} className="text-brand-600">←</Link><Link href={href(shift, nextMonth > today ? today : nextMonth)} className="text-brand-600">→</Link></span>
        </div>
        <div className="table-wrap">
          <table className="w-full text-xs" data-testid="month-grid">
            <thead><tr><th className="py-1 text-start">{t("wk.shift")}</th>{Array.from({ length: daysInMonth(y, m) }, (_, i) => <th key={i} className="px-0.5 py-1 text-center tabular-nums">{i + 1}</th>)}</tr></thead>
            <tbody>
              {scope.shifts.map((s) => (
                <tr key={s}>
                  <td className="py-1 pe-2 font-semibold whitespace-nowrap">{SHIFT_NO[s]}</td>
                  {Array.from({ length: daysInMonth(y, m) }, (_, i) => {
                    const d = ymd(y, m, i + 1);
                    const r = monthReports.find((x) => x.shift === s && ymdDate(x.day) === d);
                    const off = r ? r.records.filter((x) => x.status !== "PRESENT").length : 0;
                    return (
                      <td key={d} className="px-0.5 py-0.5 text-center">
                        {d > today ? <span className="text-muted">·</span> : (
                          <Link href={href(s, d)} title={r ? t("wk.countLine", { present: r.records.length - off, absent: r.records.filter((x) => x.status === "ABSENT").length, excused: r.records.filter((x) => x.status === "EXCUSED").length, total: r.records.length }) : t("wk.notSubmittedShort")}
                            className={cn("block rounded px-0.5 py-1 font-semibold", r ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200", d === day && s === shift && "ring-2 ring-brand-500")}
                            data-testid={r ? undefined : `missing-${SHIFT_NO[s]}-${i + 1}`}>
                            {r ? (off || "✓") : "!"}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">{t("wk.gridHint")}</p>
      </Card>
    </>
  );
}
