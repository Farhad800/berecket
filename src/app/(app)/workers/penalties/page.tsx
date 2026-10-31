import Link from "next/link";
import type { Shift } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFT_NO, dayDate, mayWork, scopeOf, ymdDate } from "@/lib/workers";
import { daysInMonth, ymd } from "@/lib/payroll-math";
import { todayYmd } from "@/lib/production";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { addPenaltyAction, changePenaltyAction } from "@/app/actions/attendance";
import WorkersNav from "../workers-nav";
import ActForm from "../act-form";

export const metadata = { title: "Penalties" };
const iqd = (n: number) => `${n.toLocaleString("en", { maximumFractionDigits: 0 })} IQD`;

/** Money penalties (IQD) of the month: given by the shift's team leader; changed or cancelled only with a reason. */
export default async function PenaltiesPage({ searchParams }: { searchParams: Promise<{ month?: string; shift?: string }> }) {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const scope = await scopeOf(me);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayYmd().slice(0, 7);
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const shifts = scope.shifts.includes(sp.shift as Shift) ? [sp.shift as Shift] : scope.shifts;
  const [list, workers, users] = await Promise.all([
    db.penalty.findMany({ where: { shift: { in: shifts }, day: { gte: dayDate(ymd(y, m, 1)), lte: dayDate(ymd(y, m, daysInMonth(y, m))) } }, orderBy: [{ day: "desc" }, { createdAt: "desc" }], include: { worker: { select: { id: true, number: true, fullName: true } } } }),
    db.worker.findMany({ where: { status: "ACTIVE", shift: { in: scope.shifts.filter((s) => mayWork(scope, s)) } }, orderBy: { fullName: "asc" }, select: { id: true, number: true, fullName: true, shift: true } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  const who = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";
  const active = list.filter((p) => p.state === "ACTIVE");
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(todayYmd().slice(0, 4)), Number(todayYmd().slice(5, 7)) - 1 - i, 1)); return d.toISOString().slice(0, 7); });
  return (
    <>
      <PageHeader title={t("wk.tab.penalties")} subtitle={t("wk.penaltiesIntro")} />
      <WorkersNav me={me} active="penalties" />
      {can(me, "penalties:create") && workers.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold">{t("wk.penaltyAdd")}</h2>
          <ActForm action={addPenaltyAction} once done={t("wk.penaltySaved")} submit={t("wk.penaltySave")} testid="penalty-form" fields={[
            { name: "workerId", label: t("wk.employee"), type: "select", required: true, wide: true, options: [{ value: "", label: "—" }, ...workers.map((w) => ({ value: w.id, label: `${w.fullName} · ${w.number} · ${t("wk.shiftN", { n: SHIFT_NO[w.shift] })}` }))] },
            { name: "amount", label: t("wk.amount"), type: "number", required: true },
            { name: "day", label: t("wk.date"), type: "date", required: true, defaultValue: todayYmd(), max: todayYmd() },
            { name: "reason", label: t("wk.reason"), required: true, wide: true },
          ]} />
        </Card>
      )}
      <ListToolbar filters={[
        { name: "month", label: t("wk.thisMonth"), options: months.map((x) => ({ value: x, label: x })) },
        ...(scope.shifts.length > 1 ? [{ name: "shift", label: t("wk.allShifts"), options: scope.shifts.map((s) => ({ value: s, label: t("wk.shiftN", { n: SHIFT_NO[s] }) })) }] : []),
      ]} />
      <p className="mb-2 text-sm">{t("wk.penaltyTotal", { n: active.length, total: iqd(active.reduce((s, p) => s + Number(p.amount), 0)) })}</p>
      {list.length === 0 ? <EmptyState>{t("wk.noPenalties")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="px-4 py-3" data-testid="penalty-row">
                <div className={`flex flex-wrap items-start justify-between gap-2 ${p.state === "CANCELLED" ? "text-muted" : ""}`}>
                  <div>
                    <Link href={`/workers/${p.worker.id}`} className="font-semibold hover:underline">{p.worker.fullName}</Link> <span className="text-xs text-muted" dir="ltr">{p.worker.number}</span> · {t("wk.shiftN", { n: SHIFT_NO[p.shift] })} · <span dir="ltr">{ymdDate(p.day)}</span>
                    <p className="text-sm">{p.reason}</p>
                    <p className="text-xs text-muted">{t("wk.givenBy", { name: who(p.issuedById), at: formatDateTime(p.createdAt, locale) })}{p.cancelReason && ` · ${t("wk.cancelled")}: ${p.cancelReason} (${who(p.cancelledById)})`}</p>
                  </div>
                  <span className="text-end"><b dir="ltr" className={`tabular-nums ${p.state === "CANCELLED" ? "line-through" : ""}`}>{iqd(Number(p.amount))}</b>{p.state === "CANCELLED" && <Badge className="ms-2">{t("wk.cancelled")}</Badge>}</span>
                </div>
                {p.state === "ACTIVE" && can(me, "penalties:create") && mayWork(scope, p.shift) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActForm action={changePenaltyAction} payload={{ id: p.id }} open={false} openLabel={t("wk.change")} submit={t("common.save")} fields={[
                      { name: "amount", label: t("wk.amount"), type: "number", defaultValue: String(Number(p.amount)) },
                      { name: "reason", label: t("wk.penaltyReason"), defaultValue: p.reason },
                      { name: "why", label: t("wk.whyChange"), required: true, wide: true },
                    ]} />
                    <ActForm action={changePenaltyAction} payload={{ id: p.id, cancel: true }} open={false} openLabel={t("wk.cancel")} submit={t("wk.cancel")} variant="danger" fields={[{ name: "why", label: t("wk.whyCancel"), required: true }]} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
