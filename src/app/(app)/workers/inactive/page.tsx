import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFT_NO, scopeOf, ymdDate } from "@/lib/workers";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { decideDepartureAction } from "@/app/actions/workers";
import WorkersNav from "../workers-nav";
import ActForm from "../act-form";

export const metadata = { title: "Inactive employees" };

/** Employees who were fired or quit: kept with all their history; the administrator confirms or undoes a departure. */
export default async function InactivePage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const me = await pageUser("workers:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const scope = await scopeOf(me);
  const q = sp.q?.trim();
  const list = await db.worker.findMany({
    where: { status: "INACTIVE", shift: { in: scope.shifts }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { number: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { endDate: "desc" }, take: 1000,
    include: { departures: { orderBy: { recordedAt: "desc" }, take: 1 }, blacklist: { where: { active: true }, select: { id: true } } },
  });
  const rows = list.filter((w) => !sp.kind || w.departures[0]?.kind === sp.kind);
  const users = await db.user.findMany({ where: { id: { in: rows.flatMap((w) => w.departures.map((d) => d.recordedById)) } }, select: { id: true, fullName: true } });
  const who = (id?: string) => users.find((u) => u.id === id)?.fullName ?? "—";
  return (
    <>
      <PageHeader title={t("wk.tab.inactive")} subtitle={t("wk.inactiveIntro")} />
      <WorkersNav me={me} active="inactive" />
      <ListToolbar placeholder={t("wk.search")} filters={[{ name: "kind", label: t("wk.firedOrQuit"), options: [{ value: "FIRED", label: t("wk.kind.FIRED") }, { value: "QUIT", label: t("wk.kind.QUIT") }] }]} />
      {rows.length === 0 ? <EmptyState>{t("wk.noneInactive")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {rows.map((w) => {
              const d = w.departures[0];
              return (
                <li key={w.id} className="px-4 py-3" data-testid={`inactive-${w.number}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/workers/${w.id}`} className="font-semibold text-brand-600 hover:underline">{w.fullName}</Link>
                    <span className="text-xs text-muted" dir="ltr">{w.number} · {w.phone}</span>
                    {d && <Badge tone={d.kind === "FIRED" ? "red" : "gray"}>{t(`wk.kind.${d.kind}`)}</Badge>}
                    {w.blacklist.length > 0 && <Badge tone="red">{t("wk.blacklisted")}</Badge>}
                    {d?.state === "WAITING" && <Badge tone="amber">{t("wk.waitingConfirm")}</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{t("wk.shiftN", { n: SHIFT_NO[d?.shift ?? w.shift] })} · {t("wk.lastDay")}: <span dir="ltr">{w.endDate ? ymdDate(w.endDate) : "—"}</span>{d && <> · {d.explanation}</>}</p>
                  {d && <p className="text-xs text-muted">{t("wk.recordedBy", { name: who(d.recordedById), at: formatDateTime(d.recordedAt, locale) })}</p>}
                  {d?.state === "WAITING" && scope.manage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActForm action={decideDepartureAction} payload={{ id: d.id, approve: true }} submit={t("wk.confirm")} />
                      <ActForm action={decideDepartureAction} payload={{ id: d.id, approve: false }} open={false} openLabel={t("wk.undo")} submit={t("wk.undo")} variant="danger" fields={[{ name: "note", label: t("wk.reason"), required: true }]} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
