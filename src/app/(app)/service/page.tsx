import Link from "next/link";
import { redirect } from "next/navigation";
import type { MaintenanceStatus, Prisma } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus, Wrench } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { factoryDay, formatDate, formatDateTime } from "@/lib/time";
import { MAINT_TONE } from "@/lib/tones";
import { Badge, Card, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import PreventivePanel from "./preventive-panel";

export const metadata = { title: "Technical Service" };
const TABS = ["requests", "reports", "preventive"] as const;
const STATUSES: MaintenanceStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "COMPLETED", "VERIFIED", "CANCELLED"];

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; request?: string; status?: string; machine?: string; q?: string }>;
}) {
  const me = await pageUser("service:view");
  const sp = await searchParams;
  if (sp.request) redirect(`/service/requests/${sp.request}`);
  const t = await getTranslations();
  const locale = await getLocale();
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "requests";
  const machines = await db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
  const q = sp.q?.trim();

  const tabs = (
    <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {TABS.map((k) => (
        <Link key={k} href={`/service?tab=${k}`} role="tab" aria-selected={tab === k}
          className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted")}>
          {t(`svc.tab.${k}`)}
        </Link>
      ))}
    </div>
  );
  const actions = (
    <>
      {can(me, "maintenance:create") && <LinkButton href="/service/requests/new" variant="secondary"><Plus className="size-4" /> {t("svc.newRequest")}</LinkButton>}
      {can(me, "service:create") && <LinkButton href="/service/reports/new"><Wrench className="size-4" /> {t("svc.newReport")}</LinkButton>}
    </>
  );

  if (tab === "requests") {
    const status = STATUSES.includes(sp.status as MaintenanceStatus) ? (sp.status as MaintenanceStatus) : undefined;
    const where: Prisma.MaintenanceRequestWhereInput = {
      ...(status ? { status } : sp.status === "all" ? {} : { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "COMPLETED"] } }),
      ...(sp.machine ? { machineId: sp.machine } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const requests = await db.maintenanceRequest.findMany({
      where,
      orderBy: [{ machineDown: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { machine: { select: { code: true } }, mold: { select: { code: true } } },
    });
    const users = await db.user.findMany({ select: { id: true, fullName: true } });
    const name = (id: string | null) => users.find((u) => u.id === id)?.fullName;
    const prio = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
    requests.sort((a, b) => Number(b.machineDown && OPENISH(b.status)) - Number(a.machineDown && OPENISH(a.status)) || prio[a.priority] - prio[b.priority]);

    return (
      <>
        <PageHeader title={t("nav.service")} actions={actions} />
        {tabs}
        <ListToolbar
          placeholder={t("svc.searchRequests")}
          filters={[
            { name: "status", label: t("svc.openStatuses"), options: [{ value: "all", label: t("order.allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: t(`status.maint.${s}`) }))] },
            { name: "machine", label: t("sched.machine"), options: machines.map((m) => ({ value: m.id, label: m.code })) },
          ]}
        />
        {requests.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/service/requests/${r.id}`} className="grid gap-1 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" dir="ltr">{r.number}</span>
                        <Badge tone={MAINT_TONE[r.status]}>{t(`status.maint.${r.status}`)}</Badge>
                        {r.machineDown && OPENISH(r.status) && <Badge tone="red">{t("svc.machineDown")}</Badge>}
                        {r.priority !== "NORMAL" && <Badge tone={r.priority === "URGENT" ? "red" : r.priority === "HIGH" ? "amber" : "gray"}>{t(`status.priority.${r.priority}`)}</Badge>}
                        {r.isPreventive && <Badge tone="purple">{t("svc.preventive")}</Badge>}
                      </div>
                      <p className="truncate text-sm">{r.title}</p>
                      <p className="text-xs text-muted" dir="ltr">{r.machine.code}{r.mold ? ` · ${r.mold.code}` : ""}</p>
                    </div>
                    <div className="text-xs text-muted sm:text-end">
                      <p>{formatDateTime(r.createdAt, locale)}</p>
                      {name(r.assignedToId) && <p>{t("svc.assignedTo")}: {name(r.assignedToId)}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (tab === "reports") {
    const reports = await db.serviceReport.findMany({
      where: {
        ...(sp.machine ? { machineId: sp.machine } : {}),
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { workPerformed: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { startTime: "desc" },
      take: 100,
      include: { machine: { select: { code: true } }, moldRemoved: { select: { code: true } }, moldInstalled: { select: { code: true } } },
    });
    const users = await db.user.findMany({ select: { id: true, fullName: true } });
    return (
      <>
        <PageHeader title={t("nav.service")} actions={actions} />
        {tabs}
        <ListToolbar placeholder={t("svc.searchReports")} filters={[{ name: "machine", label: t("sched.machine"), options: machines.map((m) => ({ value: m.id, label: m.code })) }]} />
        {reports.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/service/reports/${r.id}`} className="block px-4 py-3 hover:bg-surface-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="ltr">{r.number}</span>
                      <span className="text-sm" dir="ltr">{r.machine.code}</span>
                      <Badge>{t("sched.shift")} {r.shift}</Badge>
                      {(r.moldRemoved || r.moldInstalled) && <Badge tone="blue">{t("svc.moldChange")}: <span dir="ltr" className="ms-1">{r.moldRemoved?.code ?? "—"} → {r.moldInstalled?.code ?? "—"}</span></Badge>}
                      {r.downtimeMinutes > 0 && <Badge tone="amber">{t("prod.minutes", { n: r.downtimeMinutes })}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{r.workPerformed}</p>
                    <p className="text-xs text-muted">{formatDate(r.date, locale)} · {users.find((u) => u.id === r.technicianId)?.fullName}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  // Preventive
  const [tasks, molds] = await Promise.all([
    db.preventiveTask.findMany({ orderBy: [{ active: "desc" }, { nextDueAt: "asc" }], include: { machine: { select: { code: true } }, mold: { select: { code: true } } } }),
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const { start } = factoryDay();
  return (
    <>
      <PageHeader title={t("nav.service")} actions={actions} />
      {tabs}
      <PreventivePanel
        canEdit={can(me, "maintenance:edit")}
        canDo={can(me, "service:create")}
        canRequest={can(me, "maintenance:create")}
        machines={machines.map((m) => ({ value: m.id, label: m.code, hint: m.name }))}
        molds={molds.map((m) => ({ value: m.id, label: m.code, hint: m.name }))}
        tasks={tasks.map((x) => ({
          id: x.id,
          title: x.title,
          target: x.machine?.code ?? x.mold?.code ?? "—",
          every: x.intervalDays,
          active: x.active,
          last: x.lastDoneAt ? formatDate(x.lastDoneAt, locale) : null,
          next: formatDate(x.nextDueAt, locale),
          state: !x.active ? "off" : x.nextDueAt < start ? "overdue" : x.nextDueAt.getTime() < start.getTime() + 7 * 86_400_000 ? "soon" : "ok",
        }))}
      />
    </>
  );
}

function OPENISH(s: string) {
  return ["OPEN", "IN_PROGRESS", "WAITING_PARTS"].includes(s);
}
