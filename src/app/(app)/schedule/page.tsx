import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { FACTORY_TZ, factoryDay, formatDate, formatNumber, parseFactoryDate, toFactoryDateInput, toFactoryDateTimeInput, formatDateTime } from "@/lib/time";
import { getLineProgress, OPEN_STATUSES } from "@/lib/orders";
import { Badge, Card, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import JobPanel from "./job-panel";

export const metadata = { title: "Production Schedule" };

type View = "day" | "week" | "month";
const DAY = 86_400_000;
const SCHEDULABLE = OPEN_STATUSES.filter((s) => s !== "ON_HOLD");

function addDaysStr(s: string, n: number) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function rangeFor(view: View, date: string) {
  const noon = new Date(`${date}T12:00:00Z`);
  if (view === "day") return { from: date, days: 1 };
  if (view === "week") {
    const back = (noon.getUTCDay() + 1) % 7; // weeks start on Saturday
    return { from: addDaysStr(date, -back), days: 7 };
  }
  const first = `${date.slice(0, 8)}01`;
  const next = new Date(Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth() + 1, 1));
  return { from: first, days: Math.round((next.getTime() - Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), 1)) / DAY) };
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; job?: string; line?: string; order?: string; new?: string }>;
}) {
  const me = await pageUser("schedule:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const today = toFactoryDateInput(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const { from, days } = rangeFor(view, date);
  const rangeStart = parseFactoryDate(from);
  const rangeEnd = new Date(rangeStart.getTime() + days * DAY);
  const span = rangeEnd.getTime() - rangeStart.getTime();

  const [machines, jobs, downs, dueOrders, openLines, molds] = await Promise.all([
    db.machine.findMany({ where: { archivedAt: null, status: { not: "RETIRED" } }, orderBy: { code: "asc" } }),
    db.productionJob.findMany({
      where: { status: { not: "CANCELLED" }, plannedStart: { lt: rangeEnd }, plannedEnd: { gt: rangeStart } },
      include: { orderLine: { include: { order: { select: { id: true, number: true, requestedDeliveryDate: true, customer: { select: { name: true } } } }, product: { select: { code: true } } } }, mold: { select: { code: true } } },
      orderBy: { plannedStart: "asc" },
    }),
    db.maintenanceRequest.findMany({
      where: { machineDown: true, OR: [{ status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } }, { readyAt: { gt: rangeStart } }], createdAt: { lt: rangeEnd } },
      select: { id: true, number: true, machineId: true, createdAt: true, readyAt: true, title: true },
    }),
    db.order.findMany({
      where: { status: { in: OPEN_STATUSES }, requestedDeliveryDate: { gte: rangeStart, lt: rangeEnd } },
      select: { id: true, number: true, requestedDeliveryDate: true, priority: true, customer: { select: { name: true } } },
      orderBy: { requestedDeliveryDate: "asc" },
    }),
    db.orderLine.findMany({
      where: { order: { status: { in: SCHEDULABLE }, ...(sp.order ? { id: sp.order } : {}) } },
      include: { order: { select: { id: true, number: true, priority: true, requestedDeliveryDate: true, customer: { select: { name: true } } } }, product: { select: { id: true, code: true, name: true } } },
      orderBy: [{ order: { requestedDeliveryDate: "asc" } }, { lineNo: "asc" }],
      take: 200,
    }),
    db.mold.findMany({ where: { archivedAt: null, status: { not: "RETIRED" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, productId: true, cavities: true } }),
  ]);

  const progress = await getLineProgress([...new Set(openLines.map((l) => l.orderId))]);
  const needsPlanning = openLines
    .map((l) => ({ l, p: progress.get(l.id)! }))
    .filter(({ p }) => p && p.planned < p.quantity);

  // Clashes among the jobs on screen, so they can be outlined in red.
  const clash = new Set<string>();
  for (let i = 0; i < jobs.length; i++)
    for (let k = i + 1; k < jobs.length; k++) {
      const a = jobs[i], b = jobs[k];
      const overlap = a.plannedStart < b.plannedEnd && b.plannedStart < a.plannedEnd;
      if (overlap && ((a.machineId && a.machineId === b.machineId) || (a.moldId && a.moldId === b.moldId))) { clash.add(a.id); clash.add(b.id); }
    }

  const pos = (s: Date, e: Date) => {
    const left = Math.max(0, (s.getTime() - rangeStart.getTime()) / span) * 100;
    const right = Math.min(1, (e.getTime() - rangeStart.getTime()) / span) * 100;
    return { insetInlineStart: `${left}%`, width: `${Math.max(right - left, 0.6)}%` };
  };

  // Column headers
  const cols: { label: string; sub?: string; today?: boolean; weekend?: boolean }[] = [];
  if (view === "day") {
    // A calendar day crosses shifts: end of night shift C, then A, B, and the start of the next C.
    for (const [s, h] of [["C", "00–07"], ["A", "07–15"], ["B", "15–23"], ["C", "23–"]] as const) cols.push({ label: `${t("sched.shift")} ${s}`, sub: h });
  } else {
    for (let i = 0; i < days; i++) {
      const d = addDaysStr(from, i);
      const dt = new Date(`${d}T12:00:00Z`);
      cols.push({
        label: new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : locale, { weekday: view === "week" ? "short" : "narrow", timeZone: "UTC" }).format(dt),
        sub: d.slice(8),
        today: d === today,
        weekend: dt.getUTCDay() === 5, // Friday
      });
    }
  }
  const dayGrid = view === "day";
  const gridStyle = dayGrid
    ? { gridTemplateColumns: "7fr 8fr 8fr 1fr" }
    : { gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` };

  const nav = (d: string, v: View = view) => {
    const q = new URLSearchParams({ view: v, date: d });
    if (sp.order) q.set("order", sp.order);
    return `/schedule?${q}`;
  };
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const prev = step ? addDaysStr(date, -step) : (() => { const d = new Date(`${from}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const next = step ? addDaysStr(date, step) : (() => { const d = new Date(`${from}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
  const closeHref = nav(date);

  // Panel data
  const selected = sp.job ? await db.productionJob.findUnique({ where: { id: sp.job } }) : null;
  const showPanel = !!selected || ((sp.new === "1" || !!sp.line) && can(me, "schedule:create"));
  const lineOptions = openLines.map((l) => {
    const p = progress.get(l.id);
    return {
      value: l.id,
      label: `${l.order.number} · ${l.product.name}`,
      hint: `${l.product.code} · ${l.order.customer.name}`,
      remaining: Math.max((p?.quantity ?? l.quantity) - (p?.planned ?? 0), 0),
      productId: l.productId,
    };
  });
  if (selected && !lineOptions.some((o) => o.value === selected.orderLineId)) {
    const l = await db.orderLine.findUniqueOrThrow({ where: { id: selected.orderLineId }, include: { order: { select: { number: true } }, product: true } });
    lineOptions.push({ value: l.id, label: `${l.order.number} · ${l.product.name}`, hint: l.product.code, remaining: 0, productId: l.productId });
  }
  const tzLabel = FACTORY_TZ;

  const views: View[] = ["day", "week", "month"];
  return (
    <>
      <PageHeader
        title={t("nav.schedule")}
        subtitle={`${formatDate(rangeStart, locale)} – ${formatDate(new Date(rangeEnd.getTime() - 1), locale)} · ${tzLabel}`}
        actions={can(me, "schedule:create") && <LinkButton href={`${nav(date)}&new=1`}><Plus className="size-4" /> {t("sched.newJob")}</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {views.map((v) => (
            <Link key={v} href={nav(date, v)} className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", v === view ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
              {t(`sched.view.${v}`)}
            </Link>
          ))}
        </div>
        <div className="inline-flex items-center gap-1">
          <Link aria-label="previous" href={nav(prev)} className="rounded-lg border border-line bg-surface p-2 hover:bg-surface-2"><ChevronLeft className="size-4 rtl:rotate-180" /></Link>
          <Link href={nav(today)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-2">{t("sched.today")}</Link>
          <Link aria-label="next" href={nav(next)} className="rounded-lg border border-line bg-surface p-2 hover:bg-surface-2"><ChevronRight className="size-4 rtl:rotate-180" /></Link>
        </div>
        <div className="ms-auto flex flex-wrap gap-3 text-xs text-muted">
          <Legend cls="bg-brand-500" label={t("status.job.PLANNED")} />
          <Legend cls="bg-violet-500" label={t("status.job.IN_PROGRESS")} />
          <Legend cls="bg-emerald-600" label={t("status.job.COMPLETED")} />
          <Legend cls="bg-red-500/30 ring-1 ring-red-500" label={t("sched.machineDown")} />
        </div>
      </div>

      <div className={cn("grid gap-4", showPanel && "xl:grid-cols-[1fr_400px]")}>
        <div className="min-w-0 space-y-4">
          {machines.length === 0 ? (
            <EmptyState>
              <p className="mb-3">{t("sched.noMachines")}</p>
              <LinkButton href="/assets" variant="secondary">{t("nav.assets")}</LinkButton>
            </EmptyState>
          ) : (
            <Card className="overflow-hidden p-0 sm:p-0">
              <div className="table-wrap">
                <div className="min-w-[760px]">
                  {/* Header */}
                  <div className="grid grid-cols-[120px_1fr] border-b border-line bg-surface-2 text-xs">
                    <div className="px-3 py-2 font-semibold">{t("sched.machine")}</div>
                    <div className="grid" style={gridStyle}>
                      {cols.map((c, i) => (
                        <div key={i} className={cn("border-s border-line px-1 py-2 text-center", c.today && "bg-brand-100 font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-100", c.weekend && "text-muted")}>
                          <div className="truncate">{c.label}</div>
                          {c.sub && <div className="text-[10px] text-muted">{c.sub}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Rows */}
                  {machines.map((m) => {
                    const mj = jobs.filter((j) => j.machineId === m.id);
                    const md = downs.filter((d) => d.machineId === m.id);
                    const unavailable = ["DOWN", "MAINTENANCE"].includes(m.status);
                    return (
                      <div key={m.id} className="grid grid-cols-[120px_1fr] border-b border-line last:border-0">
                        <div className="px-3 py-2 text-sm">
                          <p className="font-semibold" dir="ltr">{m.code}</p>
                          <p className="truncate text-[11px] text-muted">{m.name}</p>
                          {unavailable && <Badge tone="red" className="mt-1">{t(`status.machine.${m.status}`)}</Badge>}
                        </div>
                        <div className="relative min-h-16" style={{ backgroundImage: "linear-gradient(to right, transparent calc(100% - 1px), var(--line) 0)", backgroundSize: `${100 / (dayGrid ? 24 : days)}% 100%` }}>
                          {md.map((d) => (
                            <Link
                              key={d.id}
                              href={`/service?request=${d.id}`}
                              title={`${d.number} · ${d.title}`}
                              className="absolute inset-y-0 bg-red-500/15 ring-1 ring-red-500/60 ring-inset"
                              style={pos(d.createdAt, d.readyAt ?? rangeEnd)}
                            />
                          ))}
                          {mj.map((j) => (
                            <Link
                              key={j.id}
                              href={`${nav(date)}&job=${j.id}`}
                              title={`${j.number} · ${j.orderLine.order.number} · ${j.orderLine.product.code} · ${formatNumber(j.plannedQty, locale)} ${t("md.pcs")}`}
                              className={cn(
                                "absolute top-2 bottom-2 overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-sm",
                                j.status === "IN_PROGRESS" ? "bg-violet-500" : j.status === "COMPLETED" ? "bg-emerald-600" : j.status === "PAUSED" ? "bg-amber-500" : "bg-brand-500",
                                clash.has(j.id) && "ring-2 ring-red-500 ring-offset-1",
                                j.plannedEnd.getTime() > j.orderLine.order.requestedDeliveryDate.getTime() + DAY && "outline-2 outline-dashed outline-red-400",
                                sp.job === j.id && "ring-2 ring-ink",
                              )}
                              style={pos(j.plannedStart, j.plannedEnd)}
                            >
                              <span className="block truncate font-semibold" dir="ltr">{j.orderLine.order.number}</span>
                              <span className="block truncate opacity-90" dir="ltr">{j.orderLine.product.code}{j.mold ? ` · ${j.mold.code}` : ""}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-semibold">{t("sched.needsPlanning")}{sp.order && <Link href={nav(date)} className="ms-2 text-xs font-normal text-brand-600">({t("sched.showAll")})</Link>}</h2>
              {needsPlanning.length === 0 ? (
                <p className="text-sm text-muted">{t("sched.allPlanned")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {needsPlanning.slice(0, 30).map(({ l, p }) => {
                    const late = l.order.requestedDeliveryDate < factoryDay().start;
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate"><Link href={`/orders/${l.order.id}`} className="font-semibold hover:underline" dir="ltr">{l.order.number}</Link> · {l.product.name}</p>
                          <p className={cn("text-xs text-muted", late && "text-red-600")}>
                            {l.order.customer.name} · {t("order.requestedDelivery")}: {formatDate(l.order.requestedDeliveryDate, locale)} · {t("sched.toPlan", { n: formatNumber(p.quantity - p.planned, locale) })}
                          </p>
                        </div>
                        {can(me, "schedule:create") && <LinkButton variant="secondary" className="min-h-9 shrink-0 px-3 text-xs" href={`${nav(date)}&line=${l.id}`}>{t("sched.plan")}</LinkButton>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="mb-2 font-semibold">{t("sched.deadlinesInRange")}</h2>
              {dueOrders.length === 0 ? (
                <p className="text-sm text-muted">{t("common.empty")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {dueOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/orders/${o.id}`} className="min-w-0 truncate hover:underline"><b dir="ltr">{o.number}</b> · {o.customer.name}</Link>
                      <span className="shrink-0 text-xs text-muted">{formatDate(o.requestedDeliveryDate, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {showPanel && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <JobPanel
              key={selected?.id ?? sp.line ?? "new"}
              mode={selected ? "edit" : "new"}
              canEdit={can(me, "schedule:edit")}
              closeHref={closeHref}
              lineOptions={lineOptions}
              machines={machines.map((m) => ({ value: m.id, label: m.code, hint: m.name }))}
              molds={molds.map((m) => ({ value: m.id, label: m.code, hint: `${m.name} · ${m.cavities}×`, productId: m.productId }))}
              initial={
                selected
                  ? {
                      jobId: selected.id,
                      number: selected.number,
                      status: selected.status,
                      orderLineId: selected.orderLineId,
                      machineId: selected.machineId ?? undefined,
                      moldId: selected.moldId ?? undefined,
                      plannedQty: String(selected.plannedQty),
                      plannedStart: toFactoryDateTimeInput(selected.plannedStart),
                      plannedEnd: toFactoryDateTimeInput(selected.plannedEnd),
                      priority: selected.priority,
                      notes: selected.notes ?? "",
                      actualStart: selected.actualStart ? formatDateTime(selected.actualStart, locale) : undefined,
                      actualEnd: selected.actualEnd ? formatDateTime(selected.actualEnd, locale) : undefined,
                    }
                  : {
                      orderLineId: sp.line,
                      plannedQty: sp.line ? String(lineOptions.find((o) => o.value === sp.line)?.remaining ?? "") : "",
                      plannedStart: `${date}T07:00`,
                      plannedEnd: `${date}T15:00`,
                    }
              }
            />
          </div>
        )}
      </div>
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("inline-block size-3 rounded-sm", cls)} />{label}</span>;
}
