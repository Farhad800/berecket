import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFT_NO, scopeOf, ymdDate } from "@/lib/workers";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { decideExcuseAction, decideExtraAction, revokeExcuseAction } from "@/app/actions/attendance";
import WorkersNav from "../workers-nav";
import ActForm from "../act-form";

export const metadata = { title: "Excused absences" };

/**
 * Excused absences and extra deduction days: waiting ones first (approve / reject), then the decided ones.
 * Team leaders see their own shift; approving needs attendance:approve.
 */
export default async function ExcusesPage() {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const scope = await scopeOf(me);
  const approver = can(me, "attendance:approve");
  const admin = can(me, "workers:manage") && approver;
  const since = new Date(Date.now() - 62 * 86_400_000);
  const inScope = { report: { shift: { in: scope.shifts } } };
  const [excuses, extras, users] = await Promise.all([
    db.attendanceRecord.findMany({ where: { ...inScope, excuseState: { not: null }, OR: [{ excuseState: "WAITING" }, { day: { gte: since } }] }, orderBy: [{ day: "desc" }], take: 300, include: { worker: { select: { id: true, number: true, fullName: true } }, report: { select: { shift: true } } } }),
    db.extraDeduction.findMany({ where: { record: inScope, OR: [{ state: "WAITING" }, { requestedAt: { gte: since } }] }, orderBy: { requestedAt: "desc" }, take: 300, include: { worker: { select: { id: true, number: true, fullName: true } }, record: { select: { day: true, report: { select: { shift: true } } } } } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  const who = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";
  const waitingEx = excuses.filter((e) => e.excuseState === "WAITING");
  const waitingXt = extras.filter((e) => e.state === "WAITING");
  const name = (w: { id: string; number: string; fullName: string }) => <Link href={`/workers/${w.id}`} className="font-semibold hover:underline">{w.fullName}</Link>;

  return (
    <>
      <PageHeader title={t("wk.tab.excuses")} subtitle={t("wk.excusesIntro")} />
      <WorkersNav me={me} active="excuses" />
      <Card className="mb-4 p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("wk.waitingExcuses", { n: waitingEx.length })}</h2>
        {waitingEx.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("wk.nothingWaiting")}</p> : (
          <ul className="divide-y divide-line">
            {waitingEx.map((e) => (
              <li key={e.id} className="px-4 py-3" data-testid="waiting-excuse">
                <p>{name(e.worker)} <span className="text-xs text-muted" dir="ltr">{e.worker.number}</span> · {t("wk.shiftN", { n: SHIFT_NO[e.report.shift] })} · <span dir="ltr">{ymdDate(e.day)}</span></p>
                <p className="text-sm">{t("wk.excuseReason")}: <b>{e.excuseReason}</b> · {t("wk.askedBy", { name: who(e.excuseById) })}</p>
                {approver && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActForm action={decideExcuseAction} payload={{ recordId: e.id, approve: true }} submit={t("wk.approve")} />
                    <ActForm action={decideExcuseAction} payload={{ recordId: e.id, approve: false }} open={false} openLabel={t("wk.reject")} submit={t("wk.reject")} variant="danger" fields={[{ name: "note", label: t("wk.reason"), required: true }]} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mb-4 p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("wk.waitingExtra", { n: waitingXt.length })}</h2>
        {waitingXt.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("wk.nothingWaiting")}</p> : (
          <ul className="divide-y divide-line">
            {waitingXt.map((x) => (
              <li key={x.id} className="px-4 py-3" data-testid="waiting-extra">
                <p>{name(x.worker)} · {t("wk.shiftN", { n: SHIFT_NO[x.record.report.shift] })} · <span dir="ltr">{ymdDate(x.record.day)}</span></p>
                <p className="text-sm">{t("wk.extraLine", { days: x.days, total: 1 + x.days })} · <b>{x.reason}</b> · {t("wk.askedBy", { name: who(x.requestedById) })}</p>
                {approver && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActForm action={decideExtraAction} payload={{ id: x.id, approve: true }} submit={t("wk.approve")} />
                    <ActForm action={decideExtraAction} payload={{ id: x.id, approve: false }} open={false} openLabel={t("wk.reject")} submit={t("wk.reject")} variant="danger" fields={[{ name: "note", label: t("wk.reason"), required: true }]} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("wk.decided")}</h2>
        {excuses.length + extras.length - waitingEx.length - waitingXt.length === 0 ? <EmptyState>{t("wk.nothingDecided")}</EmptyState> : (
          <ul className="divide-y divide-line text-sm">
            {excuses.filter((e) => e.excuseState !== "WAITING").map((e) => (
              <li key={e.id} className="px-4 py-2">
                {name(e.worker)} · <span dir="ltr">{ymdDate(e.day)}</span> · {t("wk.att.EXCUSED")}: {e.excuseReason} <Badge tone={e.excuseState === "APPROVED" ? "green" : "red"}>{t(`wk.excuse.${e.excuseState}`)}</Badge> {t("wk.decidedBy", { name: who(e.decidedById) })}{e.decisionNote && ` · ${e.decisionNote}`}
                {e.excuseState === "APPROVED" && admin && <div className="mt-1"><ActForm action={revokeExcuseAction} payload={{ recordId: e.id }} open={false} openLabel={t("wk.revoke")} submit={t("wk.revoke")} variant="danger" fields={[{ name: "reason", label: t("wk.reason"), required: true }]} /></div>}
              </li>
            ))}
            {extras.filter((x) => x.state !== "WAITING").map((x) => (
              <li key={x.id} className="px-4 py-2">{name(x.worker)} · <span dir="ltr">{ymdDate(x.record.day)}</span> · {t("wk.extraLine", { days: x.days, total: 1 + x.days })} <Badge tone={x.state === "APPROVED" ? "green" : "red"}>{t(`wk.appr.${x.state}`)}</Badge> {t("wk.decidedBy", { name: who(x.decidedById) })}{x.decisionNote && ` · ${x.decisionNote}`}</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
