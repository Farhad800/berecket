import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFTS, SHIFT_NO, maySeeSalaries, mayWork, scopeOf, ymdDate } from "@/lib/workers";
import { formatDate, formatDateTime } from "@/lib/time";
import { todayYmd } from "@/lib/production";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { addBlacklistAction, changeSalaryAction, recordDepartureAction, transferWorkerAction, updateWorkerAction } from "@/app/actions/workers";
import { addPenaltyAction, requestExtraAction } from "@/app/actions/attendance";
import ActForm from "../act-form";

export const metadata = { title: "Employee" };
const iqd = (n: number) => `${n.toLocaleString("en", { maximumFractionDigits: 0 })} IQD`;

/** One employee: details, salary (payroll roles only), tools by permission, this month and the full history. */
export default async function WorkerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const scope = await scopeOf(me);
  const w = await db.worker.findUnique({ where: { id } });
  if (!w || !scope.shifts.includes(w.shift)) notFound(); // another shift's employee is not even shown to a team leader
  const month = todayYmd().slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const [absences, penalties, salaryChanges, shiftChanges, departures, black, users] = await Promise.all([
    db.attendanceRecord.findMany({ where: { workerId: id, status: { not: "PRESENT" } }, orderBy: { day: "desc" }, take: 60, include: { extra: true } }),
    db.penalty.findMany({ where: { workerId: id }, orderBy: { day: "desc" }, take: 100 }),
    scope.salary ? db.workerSalaryChange.findMany({ where: { workerId: id }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    db.workerShiftChange.findMany({ where: { workerId: id }, orderBy: { createdAt: "desc" } }),
    db.workerDeparture.findMany({ where: { workerId: id }, orderBy: { recordedAt: "desc" } }),
    db.blacklistEntry.findMany({ where: { workerId: id }, orderBy: { addedAt: "desc" } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  const who = (uid: string | null | undefined) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const work = mayWork(scope, w.shift);
  const active = w.status === "ACTIVE";
  const shiftOpts = SHIFTS.map((s) => ({ value: s, label: t("wk.shiftN", { n: SHIFT_NO[s] }) }));
  const thisMonth = absences.filter((a) => a.day >= monthStart);
  const row = (label: string, value: React.ReactNode, testid?: string) => <div><dt className="text-xs text-muted">{label}</dt><dd className="font-semibold" data-testid={testid}>{value}</dd></div>;

  return (
    <>
      <Link href={active ? "/workers" : "/workers/inactive"} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.workers")}</Link>
      <PageHeader title={`${w.number} · ${w.fullName}`} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={active ? "green" : "gray"}>{t(`wk.status.${w.status}`)}</Badge>{black.some((b) => b.active) && <Badge tone="red">{t("wk.blacklisted")}</Badge>}</span>} />
      {saved && <div className="mb-3"><Alert tone="green">{t("wk.saved", { number: w.number })}</Alert></div>}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {row(t("wk.number"), <span dir="ltr">{w.number}</span>)}
          {row(t("wk.shift"), t("wk.shiftN", { n: SHIFT_NO[w.shift] }), "worker-shift")}
          {row(t("wk.phone"), <span dir="ltr">{w.phone}</span>)}
          {row(t("wk.startDate"), formatDate(w.startDate, locale, "UTC"))}
          {scope.salary && row(t("wk.salary"), <span dir="ltr">{iqd(Number(w.salary))}</span>, "worker-salary")}
          {w.endDate && row(t("wk.lastDay"), formatDate(w.endDate, locale, "UTC"))}
        </dl>
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {scope.manage && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("wk.edit")}</h2>
            <ActForm action={updateWorkerAction} payload={{ id }} open={false} openLabel={t("wk.edit")} submit={t("common.save")} fields={[
              { name: "fullName", label: t("wk.fullName"), required: true, defaultValue: w.fullName, wide: true },
              { name: "phone", label: t("wk.phone"), required: true, defaultValue: w.phone },
              { name: "startDate", label: t("wk.startDate"), type: "date", required: true, defaultValue: ymdDate(w.startDate) },
            ]} />
            {active && <div className="mt-3"><ActForm action={transferWorkerAction} payload={{ id }} open={false} openLabel={t("wk.transfer")} submit={t("wk.transfer")} fields={[
              { name: "shift", label: t("wk.newShift"), type: "select", required: true, options: [{ value: "", label: "—" }, ...shiftOpts.filter((o) => o.value !== w.shift)] },
              { name: "reason", label: t("wk.reasonOpt") },
            ]} /></div>}
          </Card>
        )}
        {maySeeSalaries(me, "workers:salary") && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("wk.changeSalary")}</h2>
            <p className="mb-2 text-xs text-muted">{t("wk.salaryRule")}</p>
            <ActForm action={changeSalaryAction} payload={{ id }} open={false} openLabel={t("wk.changeSalary")} submit={t("common.save")} fields={[
              { name: "salary", label: t("wk.newSalary"), type: "number", required: true, defaultValue: String(Number(w.salary)) },
              { name: "reason", label: t("wk.reason"), required: true },
            ]} />
          </Card>
        )}
        {active && work && can(me, "penalties:create") && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("wk.penaltyAdd")}</h2>
            <ActForm action={addPenaltyAction} payload={{ workerId: id }} once open={false} openLabel={t("wk.penaltyAdd")} submit={t("wk.penaltySave")} done={t("wk.penaltySaved")} fields={[
              { name: "amount", label: t("wk.amount"), type: "number", required: true },
              { name: "day", label: t("wk.date"), type: "date", required: true, defaultValue: todayYmd(), max: todayYmd() },
              { name: "reason", label: t("wk.reason"), required: true, wide: true },
            ]} />
          </Card>
        )}
        {active && work && can(me, "workers:edit") && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("wk.depart")}</h2>
            <p className="mb-2 text-xs text-muted">{t(scope.manage ? "wk.departHintAdmin" : "wk.departHint")}</p>
            <ActForm action={recordDepartureAction} payload={{ workerId: id }} open={false} openLabel={t("wk.departQuit")} submit={t("wk.departSave")} variant="danger" fields={[
              { name: "kind", label: t("wk.departKind"), type: "select", required: true, defaultValue: "QUIT", options: [{ value: "QUIT", label: t("wk.kind.QUIT") }] },
              { name: "lastDay", label: t("wk.lastDay"), type: "date", required: true, defaultValue: todayYmd(), max: todayYmd() },
              { name: "explanation", label: t("wk.explanation"), type: "textarea", required: true },
            ]} />
            <div className="mt-2"><FireForm workerId={id} canBlack={can(me, "blacklist:create")} t={t} today={todayYmd()} /></div>
          </Card>
        )}
        {!active && can(me, "blacklist:create") && !black.some((b) => b.active) && (scope.all || work) && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("wk.blackAdd")}</h2>
            <ActForm action={addBlacklistAction} payload={{ workerId: id }} open={false} openLabel={t("wk.blackAdd")} submit={t("wk.blackAdd")} variant="danger" fields={[
              { name: "reason", label: t("wk.blackReason"), required: true, wide: true },
              { name: "details", label: t("wk.blackDetails"), type: "textarea", required: true },
            ]} />
          </Card>
        )}
      </div>

      <Card className="mb-4 p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("wk.absences")}</h2>
        {absences.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("wk.noAbsences")}</p> : (
          <ul className="divide-y divide-line text-sm">
            {absences.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2">
                <div>
                  <span dir="ltr" className="font-semibold">{ymdDate(a.day)}</span> <Badge tone={a.status === "ABSENT" ? "red" : "amber"}>{t(`wk.att.${a.status}`)}</Badge>
                  {a.excuseState && <Badge>{t(`wk.excuse.${a.excuseState}`)}</Badge>}
                  {a.excuseReason && <span className="block text-xs text-muted">{a.excuseReason}{a.decisionNote ? ` · ${a.decisionNote}` : ""}</span>}
                  {a.extra && <span className="block text-xs" data-testid="extra-line">{t("wk.extraLine", { days: a.extra.days, total: 1 + a.extra.days })} · {t(`wk.appr.${a.extra.state}`)} · {a.extra.reason}</span>}
                </div>
                {a.status === "ABSENT" && (!a.extra || a.extra.state === "REJECTED") && thisMonth.includes(a) && (work || can(me, "attendance:approve")) && (can(me, "attendance:create") || can(me, "attendance:approve")) && (
                  <ActForm action={requestExtraAction} payload={{ recordId: a.id }} open={false} openLabel={t("wk.extraAsk")} submit={t("wk.extraSend")} fields={[
                    { name: "days", label: t("wk.extraDays"), type: "number", required: true, defaultValue: "1" },
                    { name: "reason", label: t("wk.reason"), required: true },
                  ]} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-4 p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("wk.tab.penalties")}</h2>
        {penalties.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("wk.noPenalties")}</p> : (
          <ul className="divide-y divide-line text-sm">
            {penalties.map((p) => (
              <li key={p.id} className={`flex justify-between gap-3 px-4 py-2 ${p.state === "CANCELLED" ? "text-muted line-through" : ""}`}>
                <span><span dir="ltr">{ymdDate(p.day)}</span> · {p.reason} · {who(p.issuedById)}{p.cancelReason && <span className="block text-xs no-underline">{t("wk.cancelled")}: {p.cancelReason}</span>}</span>
                <b dir="ltr" className="tabular-nums">{iqd(Number(p.amount))}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("wk.history")}</h2>
        <ul className="divide-y divide-line text-sm">
          {departures.map((d) => <li key={d.id} className="px-4 py-2">{formatDateTime(d.recordedAt, locale)} · <b>{t(`wk.kind.${d.kind}`)}</b> ({t("wk.lastDay")}: <span dir="ltr">{ymdDate(d.lastDay)}</span>) · {d.explanation} · {who(d.recordedById)} · {t(`wk.appr.${d.state}`)}{d.decisionNote && ` · ${d.decisionNote}`}</li>)}
          {black.map((b) => <li key={b.id} className="px-4 py-2">{formatDateTime(b.addedAt, locale)} · <b className="text-red-600">{t("wk.blacklisted")}</b>: {b.reason} · {who(b.addedById)}{!b.active && ` · ${t("wk.blackRemoved")}`}</li>)}
          {shiftChanges.map((c) => <li key={c.id} className="px-4 py-2">{formatDateTime(c.createdAt, locale)} · {t("wk.moved", { from: SHIFT_NO[c.fromShift], to: SHIFT_NO[c.toShift] })} · {who(c.changedById)}{c.reason && ` · ${c.reason}`}</li>)}
          {salaryChanges.map((c) => <li key={c.id} className="px-4 py-2">{formatDateTime(c.createdAt, locale)} · {t("wk.salaryFromTo", { from: iqd(Number(c.oldSalary)), to: iqd(Number(c.newSalary)) })} · {who(c.changedById)}{c.reason && ` · ${c.reason}`}</li>)}
          <li className="px-4 py-2 text-muted">{formatDateTime(w.createdAt, locale)} · {t("wk.created")} · {who(w.createdById)}</li>
        </ul>
      </Card>
    </>
  );
}

function FireForm({ workerId, canBlack, t, today }: { workerId: string; canBlack: boolean; t: (k: string) => string; today: string }) {
  return (
    <ActForm action={recordDepartureAction} payload={{ workerId, kind: "FIRED" }} open={false} openLabel={t("wk.departFired")} submit={t("wk.departSave")} variant="danger" fields={[
      { name: "lastDay", label: t("wk.lastDay"), type: "date", required: true, defaultValue: today, max: today },
      { name: "explanation", label: t("wk.explanation"), type: "textarea", required: true },
      ...(canBlack ? [
        { name: "toBlacklist", label: t("wk.alsoBlack"), type: "checkbox" as const },
        { name: "blackReason", label: t("wk.blackReasonIfAdded"), wide: true },
        { name: "blackDetails", label: t("wk.blackDetailsIfAdded"), type: "textarea" as const },
      ] : []),
    ]} />
  );
}
