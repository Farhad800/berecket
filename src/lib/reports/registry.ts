import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FACTORY_TZ, factoryDay, parseFactoryDate, toFactoryDateInput } from "@/lib/time";
import { getLineProgress, OPEN_STATUSES, PRIORITY_TONE, STATUS_TONE } from "@/lib/orders";
import { DOWNTIME_CATEGORIES } from "@/lib/production";
import { ISSUE_TONE, JOB_TONE, MAINT_TONE, SEVERITY_TONE } from "@/lib/tones";
import type { Column, ReportDef, ReportQuery, Row } from "./types";

// ─────────────────────────────────────────────────────────── helpers
const DAY = 86_400_000;
const num = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const ORDER_STATUSES = ["DRAFT", ...OPEN_STATUSES.filter((s) => s !== "ON_HOLD"), "ON_HOLD", "DELIVERED", "CANCELLED"];
const PRIORITY: Column = { key: "priority", label: "rep.col.priority", type: "status", ns: "status.priority", tones: PRIORITY_TONE };
const MAX_ROWS = 5000;

async function userNames() {
  const users = await db.user.findMany({ select: { id: true, fullName: true } });
  const m = new Map(users.map((u) => [u.id, u.fullName]));
  return (id: string | null | undefined) => (id ? m.get(id) ?? "—" : "—");
}

/** Orders matching the customer/priority filters (used by several order reports). */
function orderWhere(q: ReportQuery): Prisma.OrderWhereInput {
  return {
    ...(q.customer ? { customerId: q.customer } : {}),
    ...(q.priority ? { priority: q.priority as never } : {}),
  };
}

const orderHref = (id: string) => `/orders/${id}`;

// ─────────────────────────────────────────────────────────── reports
export const REPORTS: ReportDef[] = [
  // 1 ─ Production by day / week / month (and by machine, product, shift)
  {
    key: "production",
    section: "production",
    icon: "Factory",
    filters: ["range", "group", "machine", "product", "customer"],
    groups: ["day", "week", "month", "machine", "product", "shift"],
    async run(q) {
      const g = q.group ?? "day";
      const L = Prisma.sql`((e."reportedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FACTORY_TZ})`;
      const label = {
        day: Prisma.sql`to_char(${L}, 'YYYY-MM-DD')`,
        week: Prisma.sql`to_char(date_trunc('week', ${L}), 'YYYY-MM-DD')`,
        month: Prisma.sql`to_char(${L}, 'YYYY-MM')`,
        machine: Prisma.sql`COALESCE(m.code || ' · ' || m.name, '—')`,
        product: Prisma.sql`p.code || ' · ' || p.name`,
        shift: Prisma.sql`e.shift::text`,
      }[g] ?? Prisma.sql`to_char(${L}, 'YYYY-MM-DD')`;
      const rows = await db.$queryRaw<{ label: string; good: bigint; bad: bigint; batches: bigint; jobs: bigint }[]>`
        SELECT ${label} AS label, SUM(e."qtyGood") AS good, SUM(e."qtyDefective") AS bad,
               COUNT(DISTINCT e."batchId") AS batches, COUNT(DISTINCT e."jobId") AS jobs
        FROM "ProductionEntry" e
        JOIN "ProductionJob" j ON j.id = e."jobId"
        JOIN "Batch" b ON b.id = e."batchId"
        JOIN "Product" p ON p.id = b."productId"
        JOIN "OrderLine" ol ON ol.id = j."orderLineId"
        JOIN "Order" o ON o.id = ol."orderId"
        LEFT JOIN "Machine" m ON m.id = j."machineId"
        WHERE e."reportedAt" >= ${q.start} AND e."reportedAt" < ${q.end}
          ${q.machine ? Prisma.sql`AND j."machineId" = ${q.machine}` : Prisma.empty}
          ${q.product ? Prisma.sql`AND b."productId" = ${q.product}` : Prisma.empty}
          ${q.customer ? Prisma.sql`AND o."customerId" = ${q.customer}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1`;
      let out: Row[] = rows.map((r) => {
        const good = num(r.good), bad = num(r.bad);
        return { label: r.label, good, bad, total: good + bad, rate: pct(bad, good + bad), batches: num(r.batches), jobs: num(r.jobs) };
      });
      // Show every day of the range (zeros included) so gaps are visible.
      if (g === "day") {
        const have = new Map(out.map((r) => [r.label, r]));
        out = [];
        for (let t = q.start.getTime(); t < q.end.getTime() && out.length < 400; t += DAY) {
          const d = toFactoryDateInput(new Date(t + DAY / 2));
          out.push(have.get(d) ?? { label: d, good: 0, bad: 0, total: 0, rate: null, batches: 0, jobs: 0 });
        }
      }
      if (["machine", "product"].includes(g)) out.sort((a, b) => num(b.good) - num(a.good));
      const good = sum(out, (r) => num(r.good)), bad = sum(out, (r) => num(r.bad));
      const days = Math.max(1, Math.round((q.end.getTime() - q.start.getTime()) / DAY));
      return {
        columns: [
          { key: "label", label: `rep.group.${g}`, type: g === "shift" ? "status" : "text", ns: "rep.shift" },
          { key: "good", label: "rep.col.good", type: "int", total: true },
          { key: "bad", label: "rep.col.defective", type: "int", total: true },
          { key: "total", label: "rep.col.totalMade", type: "int", total: true, wide: true },
          { key: "rate", label: "rep.col.defectRate", type: "pct" },
          { key: "batches", label: "rep.col.batches", type: "int", wide: true },
          { key: "jobs", label: "rep.col.jobs", type: "int", wide: true },
        ],
        rows: out,
        totals: true,
        chart: { label: "label", value: "good" },
        kpis: [
          { label: "rep.kpi.goodPcs", value: good, type: "int" },
          { label: "rep.kpi.defectivePcs", value: bad, type: "int", tone: bad > 0 ? "warn" : undefined },
          { label: "rep.kpi.defectRate", value: pct(bad, good + bad), type: "pct" },
          { label: "rep.kpi.avgPerDay", value: Math.round(good / days), type: "int" },
        ],
      };
    },
  },

  // 2 ─ Planned versus actual production
  {
    key: "planned-vs-actual",
    section: "production",
    icon: "Target",
    filters: ["range", "machine", "product", "customer", "status"],
    statusFilter: { ns: "status.job", values: ["PLANNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] },
    async run(q) {
      const jobs = await db.productionJob.findMany({
        where: {
          plannedStart: { gte: q.start, lt: q.end },
          ...(q.status ? { status: q.status as never } : { status: { not: "CANCELLED" } }),
          ...(q.machine ? { machineId: q.machine } : {}),
          orderLine: { ...(q.product ? { productId: q.product } : {}), order: q.customer ? { customerId: q.customer } : {} },
        },
        orderBy: { plannedStart: "asc" },
        take: MAX_ROWS,
        include: { machine: true, orderLine: { include: { product: true, order: { include: { customer: true } } } } },
      });
      const made = await db.productionEntry.groupBy({ by: ["jobId"], where: { jobId: { in: jobs.map((j) => j.id) } }, _sum: { qtyGood: true } });
      const madeBy = new Map(made.map((m) => [m.jobId, num(m._sum.qtyGood)]));
      const now = Date.now();
      const rows: Row[] = jobs.map((j) => {
        const produced = madeBy.get(j.id) ?? 0;
        const finishedLate = j.actualEnd ? j.actualEnd > j.plannedEnd : j.status !== "CANCELLED" && j.plannedEnd.getTime() < now;
        return {
          job: j.number, order: j.orderLine.order.number, customer: j.orderLine.order.customer.name,
          product: j.orderLine.product.code, machine: j.machine?.code ?? "—",
          planned: j.plannedQty, produced, variance: produced - j.plannedQty, achieved: pct(produced, j.plannedQty),
          plannedEnd: j.plannedEnd, actualEnd: j.actualEnd, late: finishedLate ? "yes" : "no", status: j.status,
          _href: { job: `/production/${j.id}`, order: orderHref(j.orderLine.order.id) },
        };
      });
      const planned = sum(rows, (r) => num(r.planned)), produced = sum(rows, (r) => num(r.produced));
      return {
        columns: [
          { key: "job", label: "rep.col.job", type: "code" },
          { key: "order", label: "rep.col.order", type: "code", wide: true },
          { key: "customer", label: "rep.col.customer", wide: true },
          { key: "product", label: "rep.col.product", type: "code" },
          { key: "machine", label: "rep.col.machine", type: "code" },
          { key: "planned", label: "rep.col.planned", type: "int", total: true },
          { key: "produced", label: "rep.col.produced", type: "int", total: true },
          { key: "variance", label: "rep.col.variance", type: "signed", total: true },
          { key: "achieved", label: "rep.col.achieved", type: "pct" },
          { key: "plannedEnd", label: "rep.col.plannedEnd", type: "datetime", wide: true },
          { key: "actualEnd", label: "rep.col.actualEnd", type: "datetime", wide: true },
          { key: "late", label: "rep.col.late", type: "yesno" },
          { key: "status", label: "rep.col.status", type: "status", ns: "status.job", tones: JOB_TONE },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.jobs", value: rows.length, type: "int" },
          { label: "rep.kpi.plannedPcs", value: planned, type: "int" },
          { label: "rep.kpi.producedPcs", value: produced, type: "int" },
          { label: "rep.kpi.achievement", value: pct(produced, planned), type: "pct" },
          { label: "rep.kpi.lateJobs", value: rows.filter((r) => r.late === "yes").length, type: "int", tone: "warn" },
        ],
      };
    },
  },

  // 3 ─ Order completion rates
  {
    key: "order-completion",
    section: "orders",
    icon: "ClipboardCheck",
    filters: ["range", "customer", "priority", "status"],
    statusFilter: { ns: "status.order", values: ORDER_STATUSES },
    async run(q) {
      const orders = await db.order.findMany({
        where: {
          requestedDeliveryDate: { gte: q.start, lt: q.end },
          ...(q.status ? { status: q.status as never } : { status: { notIn: ["DRAFT", "CANCELLED"] } }),
          ...orderWhere(q),
        },
        orderBy: { requestedDeliveryDate: "asc" },
        take: MAX_ROWS,
        include: { customer: true, lines: { select: { id: true } } },
      });
      const prog = await getLineProgress(orders.map((o) => o.id));
      const rows: Row[] = orders.map((o) => {
        const ls = o.lines.map((l) => prog.get(l.id)!).filter(Boolean);
        const ordered = sum(ls, (l) => l.quantity), produced = sum(ls, (l) => Math.min(l.produced, l.quantity)), shipped = sum(ls, (l) => Math.min(l.shipped, l.quantity));
        return {
          order: o.number, customer: o.customer.name, priority: o.priority, status: o.status, due: o.requestedDeliveryDate,
          ordered, produced, shipped, prodPct: pct(produced, ordered), delPct: pct(shipped, ordered),
          _href: { order: orderHref(o.id) },
        };
      });
      const ordered = sum(rows, (r) => num(r.ordered)), shipped = sum(rows, (r) => num(r.shipped)), produced = sum(rows, (r) => num(r.produced));
      const done = rows.filter((r) => r.status === "DELIVERED").length;
      return {
        columns: [
          { key: "order", label: "rep.col.order", type: "code" },
          { key: "customer", label: "rep.col.customer" },
          { ...PRIORITY, wide: true },
          { key: "status", label: "rep.col.status", type: "status", ns: "status.order", tones: STATUS_TONE },
          { key: "due", label: "rep.col.due", type: "date" },
          { key: "ordered", label: "rep.col.ordered", type: "int", total: true },
          { key: "produced", label: "rep.col.produced", type: "int", total: true, wide: true },
          { key: "shipped", label: "rep.col.shipped", type: "int", total: true },
          { key: "prodPct", label: "rep.col.prodPct", type: "pct", wide: true },
          { key: "delPct", label: "rep.col.delPct", type: "pct" },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.orders", value: rows.length, type: "int" },
          { label: "rep.kpi.fullyDelivered", value: done, type: "int", tone: "good" },
          { label: "rep.kpi.completionRate", value: pct(done, rows.length), type: "pct" },
          { label: "rep.kpi.producedShare", value: pct(produced, ordered), type: "pct" },
          { label: "rep.kpi.deliveredShare", value: pct(shipped, ordered), type: "pct" },
        ],
      };
    },
  },

  // 4 ─ On-time delivery performance
  {
    key: "on-time",
    section: "orders",
    icon: "Timer",
    filters: ["range", "customer", "priority"],
    async run(q) {
      const orders = await db.order.findMany({
        where: { requestedDeliveryDate: { gte: q.start, lt: q.end }, status: { notIn: ["DRAFT", "CANCELLED"] }, ...orderWhere(q) },
        orderBy: { requestedDeliveryDate: "asc" },
        take: MAX_ROWS,
        include: { customer: true, shipments: { where: { status: "CONFIRMED" }, select: { shippedAt: true } } },
      });
      const now = Date.now();
      const rows: Row[] = orders.map((o) => {
        const dueEnd = factoryDay(o.requestedDeliveryDate).end.getTime();
        const last = o.shipments.reduce<number | null>((m, s) => (s.shippedAt ? Math.max(m ?? 0, s.shippedAt.getTime()) : m), null);
        const deliveredAt = o.status === "DELIVERED" ? (last ?? o.deliveredAt?.getTime() ?? null) : null;
        let outcome: string, late: number | null = null;
        if (deliveredAt != null) {
          late = Math.max(0, Math.ceil((deliveredAt - dueEnd) / DAY));
          outcome = deliveredAt <= dueEnd ? "ON_TIME" : "LATE";
        } else if (now > dueEnd) {
          late = Math.ceil((now - dueEnd) / DAY);
          outcome = "OVERDUE";
        } else outcome = "NOT_DUE";
        return {
          order: o.number, customer: o.customer.name, priority: o.priority, due: o.requestedDeliveryDate,
          delivered: deliveredAt ? new Date(deliveredAt) : null, lastShipment: last ? new Date(last) : null, late, outcome,
          _href: { order: orderHref(o.id) },
        };
      });
      const judged = rows.filter((r) => r.outcome !== "NOT_DUE");
      const onTime = judged.filter((r) => r.outcome === "ON_TIME").length;
      const lateRows = judged.filter((r) => r.outcome !== "ON_TIME");
      return {
        columns: [
          { key: "order", label: "rep.col.order", type: "code" },
          { key: "customer", label: "rep.col.customer" },
          { ...PRIORITY, wide: true },
          { key: "due", label: "rep.col.due", type: "date" },
          { key: "delivered", label: "rep.col.deliveredOn", type: "date" },
          { key: "lastShipment", label: "rep.col.lastShipment", type: "date", wide: true },
          { key: "late", label: "rep.col.daysLate", type: "days" },
          { key: "outcome", label: "rep.col.outcome", type: "status", ns: "rep.outcome", tones: { ON_TIME: "green", LATE: "red", OVERDUE: "red", NOT_DUE: "gray" } },
        ],
        rows,
        kpis: [
          { label: "rep.kpi.judged", value: judged.length, type: "int" },
          { label: "rep.kpi.onTime", value: onTime, type: "int", tone: "good" },
          { label: "rep.kpi.lateOrOverdue", value: lateRows.length, type: "int", tone: lateRows.length ? "bad" : undefined },
          { label: "rep.kpi.onTimeRate", value: pct(onTime, judged.length), type: "pct" },
          { label: "rep.kpi.avgDaysLate", value: lateRows.length ? Math.round((sum(lateRows, (r) => num(r.late)) / lateRows.length) * 10) / 10 : null, type: "days" },
        ],
      };
    },
  },

  // 5 ─ Delayed orders (open and past the requested date)
  {
    key: "delayed",
    section: "orders",
    icon: "AlarmClock",
    filters: ["customer", "priority"],
    async run(q) {
      const today = factoryDay().start;
      const orders = await db.order.findMany({
        where: { status: { in: OPEN_STATUSES }, requestedDeliveryDate: { lt: today }, ...orderWhere(q) },
        orderBy: { requestedDeliveryDate: "asc" },
        take: MAX_ROWS,
        include: { customer: true, lines: { select: { id: true } } },
      });
      const prog = await getLineProgress(orders.map((o) => o.id));
      const rows: Row[] = orders.map((o) => {
        const ls = o.lines.map((l) => prog.get(l.id)!).filter(Boolean);
        const ordered = sum(ls, (l) => l.quantity), shipped = sum(ls, (l) => Math.min(l.shipped, l.quantity));
        return {
          order: o.number, customer: o.customer.name, priority: o.priority, status: o.status, due: o.requestedDeliveryDate,
          overdue: Math.ceil((today.getTime() - factoryDay(o.requestedDeliveryDate).start.getTime()) / DAY),
          ordered, shipped, outstanding: ordered - shipped, toProduce: sum(ls, (l) => l.remainingToProduce),
          _href: { order: orderHref(o.id) },
        };
      });
      return {
        columns: [
          { key: "order", label: "rep.col.order", type: "code" },
          { key: "customer", label: "rep.col.customer" },
          PRIORITY,
          { key: "status", label: "rep.col.status", type: "status", ns: "status.order", tones: STATUS_TONE, wide: true },
          { key: "due", label: "rep.col.due", type: "date" },
          { key: "overdue", label: "rep.col.daysOverdue", type: "days" },
          { key: "ordered", label: "rep.col.ordered", type: "int", total: true, wide: true },
          { key: "shipped", label: "rep.col.shipped", type: "int", total: true, wide: true },
          { key: "toProduce", label: "rep.col.toProduce", type: "int", total: true },
          { key: "outstanding", label: "rep.col.toDeliver", type: "int", total: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.delayedOrders", value: rows.length, type: "int", tone: rows.length ? "bad" : "good" },
          { label: "rep.kpi.urgentDelayed", value: rows.filter((r) => r.priority === "URGENT").length, type: "int", tone: "warn" },
          { label: "rep.kpi.pcsToDeliver", value: sum(rows, (r) => num(r.outstanding)), type: "int" },
          { label: "rep.kpi.avgDaysOverdue", value: rows.length ? Math.round((sum(rows, (r) => num(r.overdue)) / rows.length) * 10) / 10 : null, type: "days" },
        ],
      };
    },
  },

  // 6 ─ Outstanding quantities for each order
  {
    key: "outstanding",
    section: "orders",
    icon: "ListChecks",
    filters: ["customer", "product", "priority"],
    async run(q) {
      const lines = await db.orderLine.findMany({
        where: { order: { status: { in: OPEN_STATUSES }, ...orderWhere(q) }, ...(q.product ? { productId: q.product } : {}) },
        orderBy: [{ order: { requestedDeliveryDate: "asc" } }, { lineNo: "asc" }],
        take: MAX_ROWS,
        include: { product: true, order: { include: { customer: true } } },
      });
      const prog = await getLineProgress([...new Set(lines.map((l) => l.orderId))]);
      const rows: Row[] = lines.map((l) => {
        const p = prog.get(l.id)!;
        return {
          order: l.order.number, line: l.lineNo, customer: l.order.customer.name, product: l.product.code, priority: l.order.priority, due: l.order.requestedDeliveryDate,
          ordered: l.quantity, produced: p.produced, received: p.received, shipped: p.shipped, toProduce: p.remainingToProduce, toDeliver: p.remainingToDeliver,
          _href: { order: orderHref(l.orderId) },
        };
      });
      return {
        columns: [
          { key: "order", label: "rep.col.order", type: "code" },
          { key: "line", label: "rep.col.line", type: "int", wide: true },
          { key: "customer", label: "rep.col.customer", wide: true },
          { key: "product", label: "rep.col.product", type: "code" },
          { ...PRIORITY, wide: true },
          { key: "due", label: "rep.col.due", type: "date" },
          { key: "ordered", label: "rep.col.ordered", type: "int", total: true },
          { key: "produced", label: "rep.col.produced", type: "int", total: true, wide: true },
          { key: "received", label: "rep.col.received", type: "int", total: true, wide: true },
          { key: "shipped", label: "rep.col.shipped", type: "int", total: true },
          { key: "toProduce", label: "rep.col.toProduce", type: "int", total: true },
          { key: "toDeliver", label: "rep.col.toDeliver", type: "int", total: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.openLines", value: rows.length, type: "int" },
          { label: "rep.kpi.orderedPcs", value: sum(rows, (r) => num(r.ordered)), type: "int" },
          { label: "rep.kpi.pcsToProduce", value: sum(rows, (r) => num(r.toProduce)), type: "int" },
          { label: "rep.kpi.pcsToDeliver", value: sum(rows, (r) => num(r.toDeliver)), type: "int" },
        ],
      };
    },
  },

  // 7 ─ Machine downtime
  {
    key: "downtime",
    section: "service",
    icon: "PauseCircle",
    filters: ["range", "group", "machine", "category"],
    groups: ["machine", "category", "list"],
    async run(q) {
      const g = q.group ?? "machine";
      const list = await db.downtime.findMany({
        where: { startedAt: { gte: q.start, lt: q.end }, ...(q.machine ? { machineId: q.machine } : {}), ...(q.category ? { category: q.category } : {}) },
        orderBy: { startedAt: "asc" },
        take: MAX_ROWS,
        include: { machine: true, job: { select: { id: true, number: true } }, maintenanceRequest: { select: { id: true, number: true } } },
      });
      const now = Date.now();
      const items = list.map((d) => ({ d, ms: (d.endedAt?.getTime() ?? now) - d.startedAt.getTime() }));
      const totalMs = sum(items, (i) => i.ms);
      const kpis = [
        { label: "rep.kpi.events", value: items.length, type: "int" as const },
        { label: "rep.kpi.downHours", value: hours(totalMs), type: "hours" as const, tone: totalMs ? ("warn" as const) : undefined },
        { label: "rep.kpi.breakdownHours", value: hours(sum(items.filter((i) => i.d.category === "BREAKDOWN"), (i) => i.ms)), type: "hours" as const },
        { label: "rep.kpi.ongoing", value: items.filter((i) => !i.d.endedAt).length, type: "int" as const },
      ];
      if (g === "list") {
        return {
          columns: [
            { key: "machine", label: "rep.col.machine", type: "code" },
            { key: "category", label: "rep.col.category", type: "status", ns: "prod.cat" },
            { key: "reason", label: "rep.col.reason" },
            { key: "start", label: "rep.col.started", type: "datetime" },
            { key: "end", label: "rep.col.ended", type: "datetime", wide: true },
            { key: "hours", label: "rep.col.hours", type: "hours", total: true },
            { key: "job", label: "rep.col.job", type: "code", wide: true },
            { key: "mr", label: "rep.col.request", type: "code", wide: true },
          ],
          rows: items.map(({ d, ms }) => ({
            machine: d.machine.code, category: d.category, reason: d.reason, start: d.startedAt, end: d.endedAt, hours: hours(ms),
            job: d.job?.number ?? null, mr: d.maintenanceRequest?.number ?? null,
            _href: { ...(d.job ? { job: `/production/${d.job.id}` } : {}), ...(d.maintenanceRequest ? { mr: `/service/requests/${d.maintenanceRequest.id}` } : {}) },
          })),
          totals: true,
          kpis,
        };
      }
      const groups = new Map<string, { label: string; events: number; ms: number; longest: number; href?: string }>();
      for (const { d, ms } of items) {
        const key = g === "category" ? d.category : d.machineId;
        const cur = groups.get(key) ?? { label: g === "category" ? d.category : `${d.machine.code} · ${d.machine.name}`, events: 0, ms: 0, longest: 0, href: g === "machine" ? `/history?machine=${d.machineId}` : undefined };
        cur.events++; cur.ms += ms; cur.longest = Math.max(cur.longest, ms);
        groups.set(key, cur);
      }
      const rows: Row[] = [...groups.values()].sort((a, b) => b.ms - a.ms).map((x) => ({
        label: x.label, events: x.events, hours: hours(x.ms), longest: hours(x.longest), share: pct(x.ms, totalMs),
        ...(x.href ? { _href: { label: x.href } } : {}),
      }));
      return {
        columns: [
          { key: "label", label: `rep.group.${g}`, type: g === "category" ? "status" : "text", ns: "prod.cat" },
          { key: "events", label: "rep.col.events", type: "int", total: true },
          { key: "hours", label: "rep.col.hours", type: "hours", total: true },
          { key: "longest", label: "rep.col.longest", type: "hours", wide: true },
          { key: "share", label: "rep.col.share", type: "pct" },
        ],
        rows,
        totals: true,
        chart: { label: "label", value: "hours", type: "hours" },
        kpis,
      };
    },
  },

  // 8 ─ Maintenance requests
  {
    key: "maintenance",
    section: "service",
    icon: "Wrench",
    filters: ["range", "machine", "status", "priority"],
    statusFilter: { ns: "status.maint", values: ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "COMPLETED", "VERIFIED", "CANCELLED"] },
    async run(q) {
      const name = await userNames();
      const list = await db.maintenanceRequest.findMany({
        where: {
          createdAt: { gte: q.start, lt: q.end },
          ...(q.machine ? { machineId: q.machine } : {}),
          ...(q.status ? { status: q.status as never } : {}),
          ...(q.priority ? { priority: q.priority as never } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        include: { machine: true, mold: true },
      });
      const rows: Row[] = list.map((m) => ({
        mr: m.number, machine: m.machine.code, mold: m.mold?.code ?? null, title: m.title, priority: m.priority, status: m.status,
        down: m.machineDown ? "yes" : "no", preventive: m.isPreventive ? "yes" : "no", created: m.createdAt, completed: m.completedAt,
        hours: m.completedAt ? hours(m.completedAt.getTime() - m.createdAt.getTime()) : null, assigned: name(m.assignedToId),
        _href: { mr: `/service/requests/${m.id}` },
      }));
      const done = rows.filter((r) => r.hours != null);
      return {
        columns: [
          { key: "mr", label: "rep.col.request", type: "code" },
          { key: "machine", label: "rep.col.machine", type: "code" },
          { key: "mold", label: "rep.col.mold", type: "code", wide: true },
          { key: "title", label: "rep.col.title" },
          { ...PRIORITY, wide: true },
          { key: "status", label: "rep.col.status", type: "status", ns: "status.maint", tones: MAINT_TONE },
          { key: "down", label: "rep.col.machineDown", type: "yesno", wide: true },
          { key: "preventive", label: "rep.col.preventive", type: "yesno", wide: true },
          { key: "created", label: "rep.col.created", type: "datetime", wide: true },
          { key: "completed", label: "rep.col.completed", type: "datetime", wide: true },
          { key: "hours", label: "rep.col.hoursToFix", type: "hours" },
          { key: "assigned", label: "rep.col.assigned", wide: true },
        ],
        rows,
        kpis: [
          { label: "rep.kpi.requests", value: rows.length, type: "int" },
          { label: "rep.kpi.stillOpen", value: rows.filter((r) => ["OPEN", "IN_PROGRESS", "WAITING_PARTS"].includes(String(r.status))).length, type: "int", tone: "warn" },
          { label: "rep.kpi.machineDownRequests", value: rows.filter((r) => r.down === "yes").length, type: "int" },
          { label: "rep.kpi.avgHoursToFix", value: done.length ? Math.round((sum(done, (r) => num(r.hours)) / done.length) * 10) / 10 : null, type: "hours" },
        ],
      };
    },
  },

  // 9 ─ Mold changes (from technicians' service reports)
  {
    key: "mold-changes",
    section: "service",
    icon: "ArrowLeftRight",
    filters: ["range", "machine"],
    async run(q) {
      const name = await userNames();
      const list = await db.serviceReport.findMany({
        where: {
          startTime: { gte: q.start, lt: q.end },
          OR: [{ moldRemovedId: { not: null } }, { moldInstalledId: { not: null } }],
          ...(q.machine ? { machineId: q.machine } : {}),
        },
        orderBy: { startTime: "asc" },
        take: MAX_ROWS,
        include: { machine: true, moldRemoved: true, moldInstalled: true, order: { select: { id: true, number: true } } },
      });
      const rows: Row[] = list.map((s) => ({
        sr: s.number, at: s.startTime, shift: s.shift, machine: s.machine.code, removed: s.moldRemoved?.code ?? null, installed: s.moldInstalled?.code ?? null,
        reason: s.moldChangeReason, minutes: s.downtimeMinutes, technician: name(s.technicianId), order: s.order?.number ?? null,
        _href: { sr: `/service/reports/${s.id}`, ...(s.order ? { order: orderHref(s.order.id) } : {}) },
      }));
      const mins = sum(rows, (r) => num(r.minutes));
      return {
        columns: [
          { key: "sr", label: "rep.col.serviceReport", type: "code" },
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "shift", label: "rep.col.shift", type: "status", ns: "rep.shift", wide: true },
          { key: "machine", label: "rep.col.machine", type: "code" },
          { key: "removed", label: "rep.col.moldRemoved", type: "code" },
          { key: "installed", label: "rep.col.moldInstalled", type: "code" },
          { key: "reason", label: "rep.col.reason", wide: true },
          { key: "minutes", label: "rep.col.minutes", type: "int", total: true },
          { key: "technician", label: "rep.col.technician", wide: true },
          { key: "order", label: "rep.col.order", type: "code", wide: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.moldChanges", value: rows.length, type: "int" },
          { label: "rep.kpi.changeHours", value: hours(mins * 60000), type: "hours" },
          { label: "rep.kpi.avgChangeMinutes", value: rows.length ? Math.round(mins / rows.length) : null, type: "int" },
        ],
      };
    },
  },

  // 10 ─ Quality: rejection rates by product
  {
    key: "quality",
    section: "quality",
    icon: "ShieldCheck",
    filters: ["range", "product", "customer"],
    async run(q) {
      const rows0 = await db.$queryRaw<{ productId: string; code: string; name: string; inspections: bigint; inspected: bigint; accepted: bigint; held: bigint; rejected: bigint; holds: bigint }[]>`
        SELECT p.id AS "productId", p.code, p.name, COUNT(*) AS inspections,
               SUM(i."qtyInspected") AS inspected, SUM(i."qtyAccepted") AS accepted, SUM(i."qtyHold") AS held, SUM(i."qtyRejected") AS rejected,
               COUNT(*) FILTER (WHERE i.decision IN ('HOLD','REJECT')) AS holds
        FROM "QcInspection" i
        JOIN "Batch" b ON b.id = i."batchId"
        JOIN "Product" p ON p.id = b."productId"
        JOIN "OrderLine" ol ON ol.id = b."orderLineId"
        JOIN "Order" o ON o.id = ol."orderId"
        WHERE i."inspectedAt" >= ${q.start} AND i."inspectedAt" < ${q.end}
          ${q.product ? Prisma.sql`AND p.id = ${q.product}` : Prisma.empty}
          ${q.customer ? Prisma.sql`AND o."customerId" = ${q.customer}` : Prisma.empty}
        GROUP BY p.id`;
      const scrap = await db.$queryRaw<{ productId: string; good: bigint; bad: bigint }[]>`
        SELECT b."productId", SUM(e."qtyGood") AS good, SUM(e."qtyDefective") AS bad
        FROM "ProductionEntry" e JOIN "Batch" b ON b.id = e."batchId"
        JOIN "OrderLine" ol ON ol.id = b."orderLineId" JOIN "Order" o ON o.id = ol."orderId"
        WHERE e."reportedAt" >= ${q.start} AND e."reportedAt" < ${q.end}
          ${q.product ? Prisma.sql`AND b."productId" = ${q.product}` : Prisma.empty}
          ${q.customer ? Prisma.sql`AND o."customerId" = ${q.customer}` : Prisma.empty}
        GROUP BY b."productId"`;
      const scrapBy = new Map(scrap.map((s) => [s.productId, { good: num(s.good), bad: num(s.bad) }]));
      const rows: Row[] = rows0
        .map((r) => {
          const s = scrapBy.get(r.productId) ?? { good: 0, bad: 0 };
          return {
            product: `${r.code} · ${r.name}`, inspections: num(r.inspections), inspected: num(r.inspected), accepted: num(r.accepted),
            held: num(r.held), rejected: num(r.rejected), rejRate: pct(num(r.rejected), num(r.inspected)), holds: num(r.holds),
            made: s.good + s.bad, scrapRate: pct(s.bad, s.good + s.bad),
          };
        })
        .sort((a, b) => num(b.rejRate) - num(a.rejRate));
      const inspected = sum(rows, (r) => num(r.inspected)), rejected = sum(rows, (r) => num(r.rejected));
      const allGood = sum(scrap, (s) => num(s.good)), allBad = sum(scrap, (s) => num(s.bad));
      return {
        columns: [
          { key: "product", label: "rep.col.product" },
          { key: "inspections", label: "rep.col.inspections", type: "int", total: true },
          { key: "inspected", label: "rep.col.inspected", type: "int", total: true },
          { key: "accepted", label: "rep.col.accepted", type: "int", total: true, wide: true },
          { key: "held", label: "rep.col.held", type: "int", total: true, wide: true },
          { key: "rejected", label: "rep.col.rejected", type: "int", total: true },
          { key: "rejRate", label: "rep.col.rejectionRate", type: "pct" },
          { key: "holds", label: "rep.col.holdDecisions", type: "int", total: true, wide: true },
          { key: "made", label: "rep.col.totalMade", type: "int", total: true, wide: true },
          { key: "scrapRate", label: "rep.col.defectRate", type: "pct" },
        ],
        rows,
        totals: true,
        chart: { label: "product", value: "rejRate", type: "pct" },
        kpis: [
          { label: "rep.kpi.inspections", value: sum(rows, (r) => num(r.inspections)), type: "int" },
          { label: "rep.kpi.inspectedPcs", value: inspected, type: "int" },
          { label: "rep.kpi.rejectedPcs", value: rejected, type: "int", tone: rejected ? "bad" : undefined },
          { label: "rep.kpi.rejectionRate", value: pct(rejected, inspected), type: "pct" },
          { label: "rep.kpi.defectRate", value: pct(allBad, allGood + allBad), type: "pct" },
        ],
      };
    },
  },

  // 11 ─ Quality defects by category
  {
    key: "defects",
    section: "quality",
    icon: "Bug",
    filters: ["range", "product", "severity"],
    async run(q) {
      const issues = await db.qualityIssue.findMany({
        where: {
          createdAt: { gte: q.start, lt: q.end },
          ...(q.severity ? { severity: q.severity as never } : {}),
          ...(q.product ? { batch: { productId: q.product } } : {}),
        },
        select: { severity: true, status: true, category: { select: { code: true, name: true } } },
      });
      const g = new Map<string, { label: string; n: number; critical: number; major: number; minor: number; open: number; resolved: number }>();
      for (const i of issues) {
        const k = i.category.code;
        const c = g.get(k) ?? { label: `${i.category.code} · ${i.category.name}`, n: 0, critical: 0, major: 0, minor: 0, open: 0, resolved: 0 };
        c.n++;
        c[i.severity.toLowerCase() as "critical" | "major" | "minor"]++;
        if (i.status === "RESOLVED") c.resolved++; else c.open++;
        g.set(k, c);
      }
      const rows: Row[] = [...g.values()].sort((a, b) => b.n - a.n).map((c) => ({ ...c, share: pct(c.n, issues.length) }));
      const resolved = issues.filter((i) => i.status === "RESOLVED").length;
      return {
        columns: [
          { key: "label", label: "rep.col.defectType" },
          { key: "n", label: "rep.col.issues", type: "int", total: true },
          { key: "critical", label: "rep.col.critical", type: "int", total: true },
          { key: "major", label: "rep.col.major", type: "int", total: true, wide: true },
          { key: "minor", label: "rep.col.minor", type: "int", total: true, wide: true },
          { key: "open", label: "rep.col.unresolved", type: "int", total: true },
          { key: "resolved", label: "rep.col.resolved", type: "int", total: true, wide: true },
          { key: "share", label: "rep.col.share", type: "pct" },
        ],
        rows,
        totals: true,
        chart: { label: "label", value: "n" },
        kpis: [
          { label: "rep.kpi.issues", value: issues.length, type: "int" },
          { label: "rep.kpi.critical", value: issues.filter((i) => i.severity === "CRITICAL").length, type: "int", tone: "bad" },
          { label: "rep.kpi.unresolved", value: issues.length - resolved, type: "int", tone: "warn" },
          { label: "rep.kpi.resolvedRate", value: pct(resolved, issues.length), type: "pct" },
        ],
      };
    },
  },

  // 12 ─ Corrective actions
  {
    key: "corrective",
    section: "quality",
    icon: "ClipboardPen",
    filters: ["range", "severity", "product"],
    async run(q) {
      const name = await userNames();
      const list = await db.correctiveAction.findMany({
        where: {
          performedAt: { gte: q.start, lt: q.end },
          issue: { ...(q.severity ? { severity: q.severity as never } : {}), ...(q.product ? { batch: { productId: q.product } } : {}) },
        },
        orderBy: { performedAt: "asc" },
        take: MAX_ROWS,
        include: { issue: { include: { category: true, batch: { include: { product: true } } } } },
      });
      const rows: Row[] = list.map((a) => ({
        at: a.performedAt, issue: a.issue.number, severity: a.issue.severity, category: a.issue.category.name, product: a.issue.batch.product.code,
        batch: a.issue.batch.number, action: a.description, by: name(a.performedById), status: a.issue.status,
        _href: { issue: `/qc/issues/${a.issueId}`, batch: `/qc/batches/${a.issue.batchId}` },
      }));
      const issueIds = new Set(list.map((a) => a.issueId));
      const resolved = new Set(list.filter((a) => a.issue.status === "RESOLVED").map((a) => a.issueId));
      return {
        columns: [
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "issue", label: "rep.col.issue", type: "code" },
          { key: "severity", label: "rep.col.severity", type: "status", ns: "status.severity", tones: SEVERITY_TONE },
          { key: "category", label: "rep.col.defectType", wide: true },
          { key: "product", label: "rep.col.product", type: "code", wide: true },
          { key: "batch", label: "rep.col.batch", type: "code", wide: true },
          { key: "action", label: "rep.col.actionTaken" },
          { key: "by", label: "rep.col.by", wide: true },
          { key: "status", label: "rep.col.issueStatus", type: "status", ns: "status.issue", tones: ISSUE_TONE },
        ],
        rows,
        kpis: [
          { label: "rep.kpi.actions", value: rows.length, type: "int" },
          { label: "rep.kpi.issuesCovered", value: issueIds.size, type: "int" },
          { label: "rep.kpi.issuesResolved", value: resolved.size, type: "int", tone: "good" },
        ],
      };
    },
  },

  // 13 ─ Warehouse receipts
  {
    key: "receipts",
    section: "warehouse",
    icon: "PackageCheck",
    filters: ["range", "product", "customer"],
    async run(q) {
      const name = await userNames();
      const list = await db.warehouseReceipt.findMany({
        where: {
          receivedAt: { gte: q.start, lt: q.end },
          ...(q.product ? { batch: { productId: q.product } } : {}),
          ...(q.customer ? { orderLine: { order: { customerId: q.customer } } } : {}),
        },
        orderBy: { receivedAt: "asc" },
        take: MAX_ROWS,
        include: { location: true, batch: { include: { product: true } }, orderLine: { include: { order: { include: { customer: true } } } } },
      });
      const rows: Row[] = list.map((r) => ({
        grn: r.number, at: r.receivedAt, batch: r.batch.number, product: r.batch.product.code, order: r.orderLine.order.number, customer: r.orderLine.order.customer.name,
        received: r.qtyReceived, available: r.qtyAvailable, quarantine: r.qtyQuarantine, location: r.location.code, by: name(r.receivedById),
        _href: { batch: `/qc/batches/${r.batchId}`, order: orderHref(r.orderLine.orderId) },
      }));
      const qn = sum(rows, (r) => num(r.quarantine));
      return {
        columns: [
          { key: "grn", label: "rep.col.receipt", type: "code" },
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "batch", label: "rep.col.batch", type: "code" },
          { key: "product", label: "rep.col.product", type: "code" },
          { key: "order", label: "rep.col.order", type: "code", wide: true },
          { key: "customer", label: "rep.col.customer", wide: true },
          { key: "received", label: "rep.col.received", type: "int", total: true },
          { key: "available", label: "rep.col.available", type: "int", total: true, wide: true },
          { key: "quarantine", label: "rep.col.quarantine", type: "int", total: true },
          { key: "location", label: "rep.col.location", type: "code", wide: true },
          { key: "by", label: "rep.col.by", wide: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.receipts", value: rows.length, type: "int" },
          { label: "rep.kpi.receivedPcs", value: sum(rows, (r) => num(r.received)), type: "int" },
          { label: "rep.kpi.quarantinePcs", value: qn, type: "int", tone: qn ? "warn" : undefined },
        ],
      };
    },
  },

  // 14 ─ Inventory movements
  {
    key: "movements",
    section: "warehouse",
    icon: "ArrowDownUp",
    filters: ["range", "product", "type"],
    typeFilter: { ns: "wh.mv", values: ["RECEIPT", "RESERVE", "UNRESERVE", "SHIP", "QC_SYNC", "ADJUST", "SCRAP"] },
    async run(q) {
      const name = await userNames();
      const list = await db.stockMovement.findMany({
        where: { createdAt: { gte: q.start, lt: q.end }, ...(q.product ? { productId: q.product } : {}), ...(q.type ? { type: q.type } : {}) },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        include: { product: true, batch: true, location: true },
      });
      const rows: Row[] = list.map((m) => ({
        at: m.createdAt, type: m.type, product: m.product.code, batch: m.batch.number, state: m.state, qty: m.qty,
        location: m.location?.code ?? null, reason: m.reason, by: name(m.createdById),
        _href: { batch: `/qc/batches/${m.batchId}` },
      }));
      const typed = (t: string, s: string) => sum(list.filter((m) => m.type === t && m.state === s), (m) => m.qty);
      return {
        columns: [
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "type", label: "rep.col.movement", type: "status", ns: "wh.mv" },
          { key: "product", label: "rep.col.product", type: "code" },
          { key: "batch", label: "rep.col.batch", type: "code" },
          { key: "state", label: "rep.col.stockState", type: "status", ns: "status.stock" },
          { key: "qty", label: "rep.col.qty", type: "signed" },
          { key: "location", label: "rep.col.location", type: "code", wide: true },
          { key: "reason", label: "rep.col.reason", wide: true },
          { key: "by", label: "rep.col.by", wide: true },
        ],
        rows,
        kpis: [
          { label: "rep.kpi.movements", value: rows.length, type: "int" },
          { label: "rep.kpi.receivedPcs", value: typed("RECEIPT", "AVAILABLE") + typed("RECEIPT", "QUARANTINE"), type: "int" },
          { label: "rep.kpi.shippedPcs", value: typed("SHIP", "SHIPPED"), type: "int" },
          { label: "rep.kpi.adjustments", value: list.filter((m) => ["ADJUST", "SCRAP"].includes(m.type)).length, type: "int" },
        ],
      };
    },
  },

  // 15 ─ Customer shipments
  {
    key: "shipments",
    section: "warehouse",
    icon: "Truck",
    filters: ["range", "customer"],
    async run(q) {
      const name = await userNames();
      const list = await db.shipment.findMany({
        where: { status: "CONFIRMED", shippedAt: { gte: q.start, lt: q.end }, ...(q.customer ? { customerId: q.customer } : {}) },
        orderBy: { shippedAt: "asc" },
        take: MAX_ROWS,
        include: { customer: true, order: { select: { id: true, number: true } }, lines: { select: { qty: true } } },
      });
      const rows: Row[] = list.map((s) => ({
        dn: s.deliveryNote, shipment: s.number, at: s.shippedAt, customer: s.customer.name, order: s.order.number,
        pcs: sum(s.lines, (l) => l.qty), vehicle: s.vehicle, driver: s.driver, by: name(s.confirmedById),
        _href: { shipment: `/shipments/${s.id}`, order: orderHref(s.order.id) },
      }));
      const delivered = await db.order.count({ where: { status: "DELIVERED", deliveredAt: { gte: q.start, lt: q.end }, ...(q.customer ? { customerId: q.customer } : {}) } });
      return {
        columns: [
          { key: "dn", label: "rep.col.deliveryNote", type: "code" },
          { key: "shipment", label: "rep.col.shipment", type: "code", wide: true },
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "customer", label: "rep.col.customer" },
          { key: "order", label: "rep.col.order", type: "code" },
          { key: "pcs", label: "rep.col.pieces", type: "int", total: true },
          { key: "vehicle", label: "rep.col.vehicle", wide: true },
          { key: "driver", label: "rep.col.driver", wide: true },
          { key: "by", label: "rep.col.confirmedBy", wide: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.shipments", value: rows.length, type: "int" },
          { label: "rep.kpi.shippedPcs", value: sum(rows, (r) => num(r.pcs)), type: "int" },
          { label: "rep.kpi.customersServed", value: new Set(list.map((s) => s.customerId)).size, type: "int" },
          { label: "rep.kpi.ordersCompleted", value: delivered, type: "int", tone: "good" },
        ],
      };
    },
  },
];

export const REPORT_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));
export const DOWNTIME_CATS = DOWNTIME_CATEGORIES;
export const SECTIONS = ["production", "orders", "service", "quality", "warehouse"] as const;

// ─────────────────────────────────────────────────────────── query parsing
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const ID = /^[a-z0-9]{10,40}$/i;
const WORD = /^[A-Z_]{2,30}$/;

/** Reads filters from the URL. Anything malformed is ignored rather than trusted. */
export function parseQuery(def: ReportDef, sp: Record<string, string | string[] | undefined>): ReportQuery {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = toFactoryDateInput(new Date());
  let to = isDate(get("to")) ? get("to")! : today;
  let from = isDate(get("from")) ? get("from")! : toFactoryDateInput(new Date(parseFactoryDate(to).getTime() - 29 * DAY + DAY / 2));
  if (from > to) [from, to] = [to, from];
  // Keep a single request bounded: at most ~3 years.
  if (parseFactoryDate(to).getTime() - parseFactoryDate(from).getTime() > 3 * 366 * DAY) from = toFactoryDateInput(new Date(parseFactoryDate(to).getTime() - 3 * 365 * DAY));
  const pick = (k: string, ok: (v: string) => boolean) => { const v = get(k); return v && ok(v) ? v : undefined; };
  return {
    from, to,
    start: parseFactoryDate(from),
    end: factoryDay(parseFactoryDate(to)).end,
    customer: pick("customer", (v) => ID.test(v)),
    product: pick("product", (v) => ID.test(v)),
    machine: pick("machine", (v) => ID.test(v)),
    status: pick("status", (v) => !!def.statusFilter?.values.includes(v)),
    priority: pick("priority", (v) => ["LOW", "NORMAL", "HIGH", "URGENT"].includes(v)),
    group: pick("group", (v) => !!def.groups?.includes(v)) ?? def.groups?.[0],
    category: pick("category", (v) => (DOWNTIME_CATEGORIES as readonly string[]).includes(v)),
    severity: pick("severity", (v) => ["MINOR", "MAJOR", "CRITICAL"].includes(v)),
    type: pick("type", (v) => WORD.test(v) && !!def.typeFilter?.values.includes(v)),
  };
}

/** The filter values that are actually set, for URLs and export file names. */
export function queryParams(def: ReportDef, q: ReportQuery) {
  const p = new URLSearchParams();
  if (def.filters.includes("range")) { p.set("from", q.from); p.set("to", q.to); }
  for (const k of ["customer", "product", "machine", "status", "priority", "group", "category", "severity", "type"] as const) {
    if (q[k] && def.filters.includes(k)) p.set(k, q[k]!);
  }
  return p;
}
