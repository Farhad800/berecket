import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowLeftRight, CalendarClock, Wrench } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/time";
import { MAINT_TONE } from "@/lib/tones";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";

export const metadata = { title: "Mold & Machine History" };
const DAYS = 90;
const REPEAT_LIMIT = 3; // breakdowns in 90 days that flag a repeated failure

type Ev = { at: Date; kind: "report" | "request" | "moldchange"; title: string; sub?: string; href?: string; tone?: "red" | "amber" | "blue" | "green" | "gray" | "purple"; badge?: string };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ machine?: string; mold?: string; days?: string }> }) {
  await pageUser("maintenance:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const days = [30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : DAYS;
  const since = new Date(Date.now() - days * 86_400_000);
  const n = (v: number) => formatNumber(v, locale);

  const [machines, molds] = await Promise.all([
    db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true } }),
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true, shotCount: true, currentMachine: { select: { code: true } } } }),
  ]);

  // ── Overview: one row per machine
  if (!sp.machine && !sp.mold) {
    const [downs, breakdowns, openReq, changes] = await Promise.all([
      db.maintenanceRequest.findMany({ where: { createdAt: { gte: since }, machineDown: true }, select: { machineId: true, createdAt: true, readyAt: true } }),
      db.maintenanceRequest.groupBy({ by: ["machineId"], where: { createdAt: { gte: since }, machineDown: true, isPreventive: false }, _count: true }),
      db.maintenanceRequest.groupBy({ by: ["machineId"], where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } }, _count: true }),
      db.serviceReport.groupBy({ by: ["machineId"], where: { startTime: { gte: since }, OR: [{ moldInstalledId: { not: null } }, { moldRemovedId: { not: null } }] }, _count: true }),
    ]);
    const mins = new Map<string, number>();
    for (const d of downs) mins.set(d.machineId, (mins.get(d.machineId) ?? 0) + ((d.readyAt?.getTime() ?? Date.now()) - d.createdAt.getTime()) / 60000);
    const cnt = (arr: { machineId: string; _count: number }[], id: string) => arr.find((x) => x.machineId === id)?._count ?? 0;

    return (
      <>
        <PageHeader title={t("nav.history")} subtitle={t("hist.lastDays", { n: days })} />
        <PeriodPicker days={days} base="/history?" />
        {machines.length === 0 ? <EmptyState>{t("sched.noMachines")}</EmptyState> : (
          <Card className="mb-4 p-0 sm:p-0">
            <h2 className="p-4 pb-2 font-semibold">{t("md.machines")}</h2>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-start">{t("sched.machine")}</th>
                    <th className="px-2 py-2 text-end">{t("hist.downtimeH")}</th>
                    <th className="px-2 py-2 text-end">{t("hist.breakdowns")}</th>
                    <th className="px-2 py-2 text-end">{t("hist.moldChanges")}</th>
                    <th className="px-4 py-2 text-end">{t("hist.openRequests")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {machines.map((m) => {
                    const b = cnt(breakdowns, m.id);
                    return (
                      <tr key={m.id} className="hover:bg-surface-2">
                        <td className="px-4 py-2">
                          <Link href={`/history?machine=${m.id}&days=${days}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{m.code}</Link>
                          <span className="ms-2 text-xs text-muted">{m.name}</span>
                          {["DOWN", "MAINTENANCE"].includes(m.status) && <Badge tone="red" className="ms-2">{t(`status.machine.${m.status}`)}</Badge>}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">{n(Math.round(((mins.get(m.id) ?? 0) / 60) * 10) / 10)}</td>
                        <td className={cn("px-2 py-2 text-end tabular-nums", b >= REPEAT_LIMIT && "font-bold text-red-600")}>
                          {b}{b >= REPEAT_LIMIT && <AlertTriangle className="ms-1 inline size-3.5" aria-label={t("hist.repeated")} />}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">{cnt(changes, m.id)}</td>
                        <td className="px-4 py-2 text-end tabular-nums">{cnt(openReq, m.id)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <Card className="p-0 sm:p-0">
          <h2 className="p-4 pb-2 font-semibold">{t("md.molds")}</h2>
          <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {molds.map((m) => (
              <li key={m.id} className="bg-surface">
                <Link href={`/history?mold=${m.id}&days=${days}`} className="block px-4 py-3 hover:bg-surface-2">
                  <p className="font-semibold" dir="ltr">{m.code} <span className="text-xs font-normal text-muted">{m.name}</span></p>
                  <p className="text-xs text-muted">{t("md.shots")}: {n(m.shotCount)} · {m.currentMachine ? <span dir="ltr">@{m.currentMachine.code}</span> : t(`status.mold.${m.status}`)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  // ── Detail timeline for one machine or one mold
  const isMold = !!sp.mold;
  const subject = isMold ? molds.find((m) => m.id === sp.mold) : machines.find((m) => m.id === sp.machine);
  if (!subject) return <EmptyState>{t("common.empty")}</EmptyState>;
  const id = subject.id;

  const [reports, requests, preventive, users] = await Promise.all([
    db.serviceReport.findMany({
      where: { startTime: { gte: since }, ...(isMold ? { OR: [{ moldId: id }, { moldRemovedId: id }, { moldInstalledId: id }] } : { machineId: id }) },
      orderBy: { startTime: "desc" }, take: 200,
      include: { machine: { select: { code: true } }, moldRemoved: { select: { code: true } }, moldInstalled: { select: { code: true } } },
    }),
    db.maintenanceRequest.findMany({ where: { createdAt: { gte: since }, ...(isMold ? { moldId: id } : { machineId: id }) }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.preventiveTask.findMany({ where: { active: true, ...(isMold ? { moldId: id } : { machineId: id }) }, orderBy: { nextDueAt: "asc" } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.fullName ?? "—";

  const events: Ev[] = [];
  for (const r of reports) {
    const change = r.moldRemoved || r.moldInstalled;
    events.push({
      at: r.startTime,
      kind: change ? "moldchange" : "report",
      title: change ? `${t("svc.moldChange")}: ${r.moldRemoved?.code ?? "—"} → ${r.moldInstalled?.code ?? "—"}` : r.workPerformed,
      sub: `${r.number} · ${r.machine.code} · ${name(r.technicianId)}${change && r.moldChangeReason ? ` · ${r.moldChangeReason}` : ""}`,
      href: `/service/reports/${r.id}`,
      tone: change ? "blue" : "gray",
    });
  }
  for (const r of requests) events.push({ at: r.createdAt, kind: "request", title: r.title, sub: `${r.number} · ${name(r.reportedById)}`, href: `/service/requests/${r.id}`, tone: MAINT_TONE[r.status] as Ev["tone"], badge: t(`status.maint.${r.status}`) });
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Machine stopped time = from a "machine down" request until it was ready again.
  const totalDown = requests.filter((r) => r.machineDown).reduce((s, r) => s + ((r.readyAt?.getTime() ?? Date.now()) - r.createdAt.getTime()) / 60000, 0);
  const breakdowns = requests.filter((r) => r.machineDown && !r.isPreventive).length;
  const repeated = !isMold && breakdowns >= REPEAT_LIMIT;
  const moldChanges = reports.filter((r) => r.moldInstalledId || r.moldRemovedId).length;
  const icons = { report: Wrench, request: Wrench, moldchange: ArrowLeftRight };
  const base = `/history?${isMold ? "mold" : "machine"}=${id}&`;

  return (
    <>
      <PageHeader title={`${subject.code} · ${subject.name}`} subtitle={<Link href={`/history?days=${days}`} className="text-brand-600 hover:underline">← {t("nav.history")}</Link>} />
      <PeriodPicker days={days} base={base} />
      {repeated && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t("hist.repeatedWarning", { n: breakdowns, days })}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!isMold && <Stat label={t("hist.downtimeH")} value={n(Math.round((totalDown / 60) * 10) / 10)} />}
        <Stat label={t("hist.breakdowns")} value={String(breakdowns)} warn={repeated} />
        <Stat label={t("hist.moldChanges")} value={String(moldChanges)} />
        <Stat label={t("hist.requests")} value={String(requests.length)} />
        {isMold && "shotCount" in subject && <Stat label={t("md.shots")} value={n(subject.shotCount)} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="mb-3 font-semibold">{t("hist.timeline")}</h2>
          {events.length === 0 ? <p className="text-sm text-muted">{t("common.empty")}</p> : (
            <ol className="space-y-3 border-s-2 border-line ps-4">
              {events.map((e, i) => {
                const Icon = icons[e.kind];
                const body = (
                  <>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium"><Icon className="size-4 text-muted" />{e.title}{e.badge && <Badge tone={e.tone}>{e.badge}</Badge>}</p>
                    {e.sub && <p className="text-xs text-muted">{e.sub}</p>}
                    <p className="text-xs text-muted">{formatDateTime(e.at, locale)}</p>
                  </>
                );
                return (
                  <li key={i} className="relative">
                    <span className={cn("absolute -start-[21px] top-1.5 size-2.5 rounded-full", e.tone === "red" ? "bg-red-500" : e.tone === "amber" ? "bg-amber-500" : e.tone === "blue" ? "bg-brand-500" : "bg-slate-400")} aria-hidden />
                    {e.href ? <Link href={e.href} className="block hover:opacity-80">{body}</Link> : body}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="size-4" /> {t("svc.tab.preventive")}</h2>
            {preventive.length === 0 ? <p className="text-sm text-muted">{t("svc.noPreventive")}</p> : (
              <ul className="space-y-2 text-sm">
                {preventive.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.title}</span>
                    <span className={cn("text-xs", p.nextDueAt < new Date() ? "font-semibold text-red-600" : "text-muted")}>{formatDate(p.nextDueAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card className={cn(warn && "border-red-300 dark:border-red-900")}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", warn && "text-red-600")}>{value}</p>
    </Card>
  );
}

async function PeriodPicker({ days, base }: { days: number; base: string }) {
  const t = await getTranslations("hist");
  return (
    <div className="mb-4 inline-flex rounded-lg border border-line bg-surface p-0.5">
      {[30, 90, 365].map((d) => (
        <Link key={d} href={`${base}days=${d}`} className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", d === days ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
          {t("days", { n: d })}
        </Link>
      ))}
    </div>
  );
}
