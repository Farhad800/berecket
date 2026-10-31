import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFTS, SHIFT_NO, scopeOf } from "@/lib/workers";
import { Card, PageHeader } from "@/components/ui";
import { setLeaderAction } from "@/app/actions/workers";
import WorkersNav from "../workers-nav";
import ActForm from "../act-form";

export const metadata = { title: "Shift management" };
const HOURS = { A: "07:00–15:00", B: "15:00–23:00", C: "23:00–07:00" } as const;

/** The three shifts: team leader (changed by the administrator), and the active employees of each. */
export default async function ShiftsPage() {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const scope = await scopeOf(me);
  const [leaders, workers, users] = await Promise.all([
    db.shiftLeader.findMany(),
    db.worker.findMany({ where: { status: "ACTIVE", shift: { in: scope.shifts } }, orderBy: { fullName: "asc" }, select: { id: true, number: true, fullName: true, shift: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, role: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title={t("wk.tab.shifts")} subtitle={t("wk.shiftsIntro")} />
      <WorkersNav me={me} active="shifts" />
      <div className="grid gap-4 lg:grid-cols-3">
        {SHIFTS.map((s) => {
          const leader = users.find((u) => u.id === leaders.find((l) => l.shift === s)?.userId);
          const list = workers.filter((w) => w.shift === s);
          return (
            <Card key={s} data-testid={`shift-${SHIFT_NO[s]}`}>
              <h2 className="font-semibold">{t("wk.shiftN", { n: SHIFT_NO[s] })} <span className="text-xs font-normal text-muted" dir="ltr">{HOURS[s]}</span></h2>
              <p className="mt-1 text-sm">{t("wk.leader")}: <b data-testid={`leader-${SHIFT_NO[s]}`}>{leader?.fullName ?? t("wk.noLeader")}</b></p>
              {scope.manage && (
                <div className="mt-2"><ActForm action={setLeaderAction} payload={{ shift: s }} open={false} openLabel={t("wk.setLeader")} submit={t("common.save")} fields={[
                  { name: "userId", label: t("wk.leader"), type: "select", defaultValue: leader?.id ?? "", options: [{ value: "", label: t("wk.noLeader") }, ...users.map((u) => ({ value: u.id, label: `${u.fullName} (${u.role.name})` }))] },
                ]} /></div>
              )}
              {scope.shifts.includes(s) ? (
                <>
                  <p className="mt-3 text-xs text-muted">{t("wk.activeN", { n: list.length })}</p>
                  <ul className="mt-1 max-h-72 divide-y divide-line overflow-y-auto text-sm">
                    {list.map((w) => <li key={w.id} className="py-1"><Link href={`/workers/${w.id}`} className="hover:underline">{w.fullName}</Link> <span className="text-xs text-muted" dir="ltr">{w.number}</span></li>)}
                  </ul>
                </>
              ) : <p className="mt-3 text-xs text-muted">{t("wk.otherShift")}</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
