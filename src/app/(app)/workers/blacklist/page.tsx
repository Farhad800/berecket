import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFTS, SHIFT_NO } from "@/lib/workers";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { addBlacklistAction, decideBlacklistRemovalAction, requestBlacklistRemovalAction } from "@/app/actions/workers";
import WorkersNav from "../workers-nav";
import ActForm from "../act-form";

export const metadata = { title: "Blacklisted employees" };

/** One blacklist shared by all three shifts. Removal needs the administrator; removed entries stay in history. */
export default async function BlacklistPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const me = await pageUser("blacklist:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const list = await db.blacklistEntry.findMany({
    where: { active: sp.show !== "removed", ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
    orderBy: { addedAt: "desc" }, take: 1000,
  });
  const users = await db.user.findMany({ where: { id: { in: list.flatMap((b) => [b.addedById, b.removalRequestedById, b.removalDecidedById].filter((x): x is string => !!x)) } }, select: { id: true, fullName: true } });
  const who = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";
  const admin = can(me, "blacklist:manage");
  return (
    <>
      <PageHeader title={t("wk.tab.blacklist")} subtitle={t("wk.blackIntro")} />
      <WorkersNav me={me} active="blacklist" />
      {can(me, "blacklist:create") && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold">{t("wk.blackAddOther")}</h2>
          <ActForm action={addBlacklistAction} open={false} openLabel={t("wk.blackAdd")} submit={t("wk.blackAdd")} variant="danger" done={t("wk.blackSaved")} fields={[
            { name: "fullName", label: t("wk.fullName"), required: true },
            { name: "phone", label: t("wk.phone"), required: true },
            { name: "shift", label: t("wk.prevShift"), type: "select", options: [{ value: "", label: "—" }, ...SHIFTS.map((s) => ({ value: s, label: t("wk.shiftN", { n: SHIFT_NO[s] }) }))] },
            { name: "reason", label: t("wk.blackReason"), required: true },
            { name: "details", label: t("wk.blackDetails"), type: "textarea", required: true },
          ]} />
        </Card>
      )}
      <ListToolbar placeholder={t("wk.search")} filters={[{ name: "show", label: t("wk.onList"), options: [{ value: "removed", label: t("wk.blackRemovedList") }] }]} />
      {list.length === 0 ? <EmptyState>{t("wk.noneBlack")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {list.map((b) => (
              <li key={b.id} className="px-4 py-3" data-testid="black-row">
                <div className="flex flex-wrap items-center gap-2">
                  {b.workerId ? <Link href={`/workers/${b.workerId}`} className="font-semibold hover:underline">{b.fullName}</Link> : <b>{b.fullName}</b>}
                  <span className="text-xs text-muted" dir="ltr">{b.phone}</span>
                  <Badge>{b.shift ? t("wk.shiftN", { n: SHIFT_NO[b.shift] }) : "—"}</Badge>
                  {b.removalState === "WAITING" && <Badge tone="amber">{t("wk.removalWaiting")}</Badge>}
                  {!b.active && <Badge tone="gray">{t("wk.blackRemoved")}</Badge>}
                </div>
                <p className="mt-1 text-sm"><b>{b.reason}</b> — {b.details}</p>
                <p className="text-xs text-muted">{t("wk.addedBy", { name: who(b.addedById), at: formatDateTime(b.addedAt, locale) })}{b.removalReason && ` · ${t("wk.removalReason")}: ${b.removalReason} (${who(b.removalRequestedById)})`}{b.removalDecidedById && ` · ${t("wk.decidedBy", { name: who(b.removalDecidedById) })}`}</p>
                {b.active && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.removalState === "WAITING" && admin && <>
                      <ActForm action={decideBlacklistRemovalAction} payload={{ id: b.id, approve: true }} submit={t("wk.removalApprove")} variant="danger" />
                      <ActForm action={decideBlacklistRemovalAction} payload={{ id: b.id, approve: false }} submit={t("wk.removalRefuse")} variant="secondary" />
                    </>}
                    {b.removalState !== "WAITING" && (can(me, "blacklist:create") || admin) && (
                      <ActForm action={requestBlacklistRemovalAction} payload={{ id: b.id }} open={false} openLabel={t(admin ? "wk.removeNow" : "wk.removeAsk")} submit={t(admin ? "wk.removeNow" : "wk.removeAsk")} variant="secondary" fields={[{ name: "reason", label: t("wk.reason"), required: true }]} />
                    )}
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
