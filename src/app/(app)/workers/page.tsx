import Link from "next/link";
import type { Prisma, Shift } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { UserPlus } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFTS, SHIFT_NO, scopeOf } from "@/lib/workers";
import { formatDate } from "@/lib/time";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import WorkersNav from "./workers-nav";

export const metadata = { title: "Employees" };
const iqd = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });

/** Active employees of the shifts this user may see; salaries only for payroll roles and the administrator. */
export default async function WorkersPage({ searchParams }: { searchParams: Promise<{ q?: string; shift?: string }> }) {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const scope = await scopeOf(me);
  const shift = (SHIFTS as readonly string[]).includes(sp.shift ?? "") && scope.shifts.includes(sp.shift as Shift) ? (sp.shift as Shift) : undefined;
  const q = sp.q?.trim();
  const where: Prisma.WorkerWhereInput = {
    status: "ACTIVE", shift: shift ?? { in: scope.shifts },
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  const [list, counts] = await Promise.all([
    db.worker.findMany({ where, orderBy: [{ shift: "asc" }, { fullName: "asc" }], take: 2000, select: { id: true, number: true, fullName: true, phone: true, shift: true, startDate: true, ...(scope.salary ? { salary: true } : {}) } }),
    db.worker.groupBy({ by: ["shift"], where: { status: "ACTIVE", shift: { in: scope.shifts } }, _count: { _all: true } }),
  ]);
  const count = (s: Shift) => counts.find((c) => c.shift === s)?._count._all ?? 0;
  return (
    <>
      <PageHeader title={t("nav.workers")} subtitle={t("wk.intro")} actions={can(me, "workers:manage") ? <LinkButton href="/workers/new"><UserPlus className="size-4" /> {t("wk.add")}</LinkButton> : undefined} />
      <WorkersNav me={me} active="active" />
      {!scope.shifts.length && <div className="mb-4"><Alert tone="amber">{t("wk.noShift")}</Alert></div>}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {scope.shifts.map((s) => <Card key={s}><p className="text-xs text-muted">{t("wk.shiftN", { n: SHIFT_NO[s] })}</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid={`count-${SHIFT_NO[s]}`}>{count(s)}</p></Card>)}
      </div>
      <ListToolbar placeholder={t("wk.search")} filters={scope.shifts.length > 1 ? [{ name: "shift", label: t("wk.allShifts"), options: scope.shifts.map((s) => ({ value: s, label: t("wk.shiftN", { n: SHIFT_NO[s] }) })) }] : []} />
      {list.length === 0 ? <EmptyState>{t("wk.none")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {list.map((w) => (
              <li key={w.id}>
                <Link href={`/workers/${w.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2"><span className="font-semibold" dir="ltr">{w.number}</span><span className="truncate">{w.fullName}</span></p>
                    <p className="mt-0.5 text-xs text-muted"><span dir="ltr">{w.phone}</span> · {t("wk.shiftN", { n: SHIFT_NO[w.shift] })} · {t("wk.since", { date: formatDate(w.startDate, locale, "UTC") })}</p>
                  </div>
                  {"salary" in w && w.salary !== undefined && <span className="self-center text-sm font-semibold tabular-nums" dir="ltr">{iqd(Number(w.salary))} IQD</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
