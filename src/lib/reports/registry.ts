import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { factoryDay, parseFactoryDate, toFactoryDateInput } from "@/lib/time";
import { ISSUE_TONE, MAINT_TONE, MOVE_TONE, ORDER_TONE, PRIORITY_TONE, SEVERITY_TONE, ENTRY_QC_TONE } from "@/lib/tones";
import type { Column, ReportDef, ReportQuery, Row } from "./types";
import { lineTotal } from "@/lib/money";
import { canSeeMoney } from "@/lib/auth";

// ─────────────────────────────────────────────────────────── helpers
const DAY = 86_400_000;
const num = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const PRIORITY: Column = { key: "priority", label: "rep.col.priority", type: "status", ns: "status.priority", tones: PRIORITY_TONE };
const MAX_ROWS = 5000;
/** ProductionEntry.day is a DATE: compare with the factory calendar day strings. */
const dayRange = (q: ReportQuery) => ({ gte: new Date(`${q.from}T00:00:00Z`), lte: new Date(`${q.to}T00:00:00Z`) });

async function userNames() {
  const users = await db.user.findMany({ select: { id: true, fullName: true } });
  const m = new Map(users.map((u) => [u.id, u.fullName]));
  return (id: string | null | undefined) => (id ? m.get(id) ?? "—" : "—");
}

// ─────────────────────────────────────────────────────────── reports
export const REPORTS: ReportDef[] = [
  // 1 ─ Production by day / week / month / product / shift
  {
    key: "production",
    section: "production",
    icon: "Factory",
    filters: ["range", "group", "product"],
    groups: ["day", "week", "month", "product", "shift"],
    async run(q) {
      const g = q.group ?? "day";
      const D = Prisma.sql`e."day"`;
      const label = {
        day: Prisma.sql`to_char(${D}, 'YYYY-MM-DD')`,
        week: Prisma.sql`to_char(date_trunc('week', ${D}), 'YYYY-MM-DD')`,
        month: Prisma.sql`to_char(${D}, 'YYYY-MM')`,
        product: Prisma.sql`p.code || ' · ' || p.name`,
        shift: Prisma.sql`e.shift::text`,
      }[g] ?? Prisma.sql`to_char(${D}, 'YYYY-MM-DD')`;
      const rows = await db.$queryRaw<{ label: string; pcs: bigint; entries: bigint; products: bigint; rejected: bigint }[]>`
        SELECT ${label} AS label, SUM(e.quantity) AS pcs, COUNT(*) AS entries, COUNT(DISTINCT e."productId") AS products,
               COALESCE(SUM((SELECT SUM(i."qtyRejected") FROM "QcInspection" i WHERE i."entryId" = e.id)), 0) AS rejected
        FROM "ProductionEntry" e JOIN "Product" p ON p.id = e."productId"
        WHERE e."day" >= ${q.from}::date AND e."day" <= ${q.to}::date
          ${q.product ? Prisma.sql`AND e."productId" = ${q.product}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1`;
      let out: Row[] = rows.map((r) => ({ label: r.label, pcs: num(r.pcs), rejected: num(r.rejected), net: num(r.pcs) - num(r.rejected), entries: num(r.entries), products: num(r.products) }));
      if (g === "day") {
        const have = new Map(out.map((r) => [r.label, r]));
        out = [];
        for (let t = Date.parse(`${q.from}T00:00:00Z`); t <= Date.parse(`${q.to}T00:00:00Z`) && out.length < 400; t += DAY) {
          const d = new Date(t).toISOString().slice(0, 10);
          out.push(have.get(d) ?? { label: d, pcs: 0, rejected: 0, net: 0, entries: 0, products: 0 });
        }
      }
      if (g === "product") out.sort((a, b) => num(b.pcs) - num(a.pcs));
      const pcs = sum(out, (r) => num(r.pcs)), rejected = sum(out, (r) => num(r.rejected));
      const days = Math.max(1, Math.round((Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / DAY) + 1);
      return {
        columns: [
          { key: "label", label: `rep.group.${g}`, type: g === "shift" ? "status" : "text", ns: "rep.shift" },
          { key: "pcs", label: "rep.col.produced", type: "int", total: true },
          { key: "rejected", label: "rep.col.rejected", type: "int", total: true },
          { key: "net", label: "rep.col.good", type: "int", total: true, wide: true },
          { key: "entries", label: "rep.col.entries", type: "int", total: true, wide: true },
          ...(g === "product" ? [] : [{ key: "products", label: "rep.col.products", type: "int" as const, wide: true }]),
        ],
        rows: out,
        totals: true,
        chart: { label: "label", value: "pcs" },
        kpis: [
          { label: "rep.kpi.producedPcs", value: pcs, type: "int" },
          { label: "rep.kpi.rejectedPcs", value: rejected, type: "int", tone: rejected ? "warn" : undefined },
          { label: "rep.kpi.rejectionRate", value: pct(rejected, pcs), type: "pct" },
          { label: "rep.kpi.avgPerDay", value: Math.round(pcs / days), type: "int" },
        ],
      };
    },
  },

  // 2 ─ Every daily production entry
  {
    key: "production-entries",
    section: "production",
    icon: "ListChecks",
    filters: ["range", "product", "status"],
    statusFilter: { ns: "status.entryQc", values: ["NOT_INSPECTED", "APPROVED", "REJECTED"] },
    async run(q) {
      const name = await userNames();
      const list = await db.productionEntry.findMany({
        where: { day: dayRange(q), ...(q.product ? { productId: q.product } : {}), ...(q.status ? { qcStatus: q.status as never } : {}) },
        orderBy: [{ day: "asc" }, { shift: "asc" }, { product: { code: "asc" } }],
        take: MAX_ROWS,
        include: { product: true, inspections: { select: { qtyRejected: true } } },
      });
      const rows: Row[] = list.map((e) => ({
        day: e.day.toISOString().slice(0, 10), shift: e.shift, product: `${e.product.code} · ${e.product.name}`, qty: e.quantity,
        rejected: sum(e.inspections, (i) => i.qtyRejected), qc: e.qcStatus, by: name(e.createdById),
        _href: { product: `/qc/entries/${e.id}` },
      }));
      return {
        columns: [
          { key: "day", label: "rep.col.day", type: "code" },
          { key: "shift", label: "rep.col.shift", type: "status", ns: "rep.shift" },
          { key: "product", label: "rep.col.product" },
          { key: "qty", label: "rep.col.produced", type: "int", total: true },
          { key: "rejected", label: "rep.col.rejected", type: "int", total: true },
          { key: "qc", label: "rep.col.qc", type: "status", ns: "status.entryQc", tones: ENTRY_QC_TONE },
          { key: "by", label: "rep.col.by", wide: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.entries", value: rows.length, type: "int" },
          { label: "rep.kpi.producedPcs", value: sum(rows, (r) => num(r.qty)), type: "int" },
          { label: "rep.kpi.notInspected", value: rows.filter((r) => r.qc === "NOT_INSPECTED").length, type: "int" },
        ],
      };
    },
  },

  // 3 ─ Orders
  {
    key: "orders",
    section: "orders",
    icon: "ClipboardCheck",
    filters: ["range", "status", "product"],
    statusFilter: { ns: "status.order", values: ["OPEN", "COMPLETED", "CANCELLED"] },
    async run(q) {
      const name = await userNames();
      const orders = await db.order.findMany({
        where: {
          createdAt: { gte: q.start, lt: q.end },
          ...(q.status ? { status: q.status as never } : {}),
          ...(q.product ? { lines: { some: { productId: q.product } } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        include: { lines: { select: { quantity: true } } },
      });
      const rows: Row[] = orders.map((o) => ({
        order: o.number, created: o.createdAt, status: o.status, products: o.lines.length, pieces: sum(o.lines, (l) => l.quantity),
        completed: o.completedAt, by: name(o.createdById), _href: { order: `/orders/${o.id}` },
      }));
      return {
        columns: [
          { key: "order", label: "rep.col.order", type: "code" },
          { key: "created", label: "rep.col.created", type: "date" },
          { key: "status", label: "rep.col.status", type: "status", ns: "status.order", tones: ORDER_TONE },
          { key: "products", label: "rep.col.products", type: "int", total: true },
          { key: "pieces", label: "rep.col.ordered", type: "int", total: true },
          { key: "completed", label: "rep.col.completed", type: "date", wide: true },
          { key: "by", label: "rep.col.by", wide: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.orders", value: rows.length, type: "int" },
          { label: "rep.kpi.stillOpen", value: rows.filter((r) => r.status === "OPEN").length, type: "int" },
          { label: "rep.kpi.orderedPcs", value: sum(rows, (r) => num(r.pieces)), type: "int" },
        ],
      };
    },
  },

  // 4 ─ What open orders still need, against stock and recent production
  {
    key: "demand",
    section: "orders",
    icon: "Target",
    filters: ["range", "product"],
    async run(q) {
      const [demand, stock, made] = await Promise.all([
        db.orderLine.groupBy({ by: ["productId"], where: { order: { status: "OPEN" }, ...(q.product ? { productId: q.product } : {}) }, _sum: { quantity: true }, _count: { orderId: true } }),
        db.stockMovement.groupBy({ by: ["productId"], _sum: { qty: true } }),
        db.productionEntry.groupBy({ by: ["productId"], where: { day: dayRange(q) }, _sum: { quantity: true } }),
      ]);
      const products = await db.product.findMany({ where: { id: { in: demand.map((d) => d.productId) } }, select: { id: true, code: true, name: true } });
      const rows: Row[] = demand
        .map((d) => {
          const p = products.find((x) => x.id === d.productId)!;
          const ordered = d._sum.quantity ?? 0, inStock = Number(stock.find((s) => s.productId === d.productId)?._sum.qty ?? 0);
          return {
            product: `${p.code} · ${p.name}`, orders: d._count.orderId, ordered, stock: inStock,
            made: made.find((m) => m.productId === d.productId)?._sum.quantity ?? 0, short: Math.max(ordered - inStock, 0),
          };
        })
        .sort((a, b) => b.short - a.short);
      return {
        columns: [
          { key: "product", label: "rep.col.product" },
          { key: "orders", label: "rep.col.openOrders", type: "int", wide: true },
          { key: "ordered", label: "rep.col.ordered", type: "int", total: true },
          { key: "stock", label: "rep.col.inStock", type: "int", total: true },
          { key: "made", label: "rep.col.madeInPeriod", type: "int", total: true, wide: true },
          { key: "short", label: "rep.col.stillToMake", type: "int", total: true },
        ],
        rows,
        totals: true,
        chart: { label: "product", value: "short" },
        kpis: [
          { label: "rep.kpi.productsOrdered", value: rows.length, type: "int" },
          { label: "rep.kpi.orderedPcs", value: sum(rows, (r) => num(r.ordered)), type: "int" },
          { label: "rep.kpi.pcsToProduce", value: sum(rows, (r) => num(r.short)), type: "int", tone: "warn" },
        ],
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
        include: { machine: true, moldRemoved: true, moldInstalled: true },
      });
      const rows: Row[] = list.map((s) => ({
        sr: s.number, at: s.startTime, shift: s.shift, machine: s.machine.code, removed: s.moldRemoved?.code ?? null, installed: s.moldInstalled?.code ?? null,
        reason: s.moldChangeReason, minutes: s.downtimeMinutes, technician: name(s.technicianId),
        _href: { sr: `/service/reports/${s.id}` },
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
          ...(q.product ? { entry: { productId: q.product } } : {}),
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

  // ─ Quality: rejection rates by product
  {
    key: "quality",
    section: "quality",
    icon: "ShieldCheck",
    filters: ["range", "product"],
    async run(q) {
      const rows0 = await db.$queryRaw<{ productId: string; code: string; name: string; inspections: bigint; inspected: bigint; rejected: bigint }[]>`
        SELECT p.id AS "productId", p.code, p.name, COUNT(*) AS inspections, SUM(i."qtyInspected") AS inspected, SUM(i."qtyRejected") AS rejected
        FROM "QcInspection" i JOIN "ProductionEntry" e ON e.id = i."entryId" JOIN "Product" p ON p.id = e."productId"
        WHERE i."inspectedAt" >= ${q.start} AND i."inspectedAt" < ${q.end}
          ${q.product ? Prisma.sql`AND p.id = ${q.product}` : Prisma.empty}
        GROUP BY p.id`;
      const made = await db.productionEntry.groupBy({ by: ["productId"], where: { day: dayRange(q), ...(q.product ? { productId: q.product } : {}) }, _sum: { quantity: true } });
      const rows: Row[] = rows0
        .map((r) => ({
          product: `${r.code} · ${r.name}`, inspections: num(r.inspections), inspected: num(r.inspected), rejected: num(r.rejected),
          rejRate: pct(num(r.rejected), num(r.inspected)), made: made.find((m) => m.productId === r.productId)?._sum.quantity ?? 0,
        }))
        .sort((a, b) => num(b.rejRate) - num(a.rejRate));
      const inspected = sum(rows, (r) => num(r.inspected)), rejected = sum(rows, (r) => num(r.rejected));
      return {
        columns: [
          { key: "product", label: "rep.col.product" },
          { key: "inspections", label: "rep.col.inspections", type: "int", total: true },
          { key: "inspected", label: "rep.col.inspected", type: "int", total: true },
          { key: "rejected", label: "rep.col.rejected", type: "int", total: true },
          { key: "rejRate", label: "rep.col.rejectionRate", type: "pct" },
          { key: "made", label: "rep.col.madeInPeriod", type: "int", total: true, wide: true },
        ],
        rows,
        totals: true,
        chart: { label: "product", value: "rejRate", type: "pct" },
        kpis: [
          { label: "rep.kpi.inspections", value: sum(rows, (r) => num(r.inspections)), type: "int" },
          { label: "rep.kpi.inspectedPcs", value: inspected, type: "int" },
          { label: "rep.kpi.rejectedPcs", value: rejected, type: "int", tone: rejected ? "bad" : undefined },
          { label: "rep.kpi.rejectionRate", value: pct(rejected, inspected), type: "pct" },
        ],
      };
    },
  },

  // ─ Corrective actions
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
          issue: { ...(q.severity ? { severity: q.severity as never } : {}), ...(q.product ? { entry: { productId: q.product } } : {}) },
        },
        orderBy: { performedAt: "asc" },
        take: MAX_ROWS,
        include: { issue: { include: { category: true, entry: { include: { product: true } } } } },
      });
      const rows: Row[] = list.map((a) => ({
        at: a.performedAt, issue: a.issue.number, severity: a.issue.severity, category: a.issue.category.name, product: a.issue.entry.product.code,
        action: a.description, by: name(a.performedById), status: a.issue.status,
        _href: { issue: `/qc/issues/${a.issueId}`, product: `/qc/entries/${a.issue.entryId}` },
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

  // ─ Stock on hand per product, with in/out during the period
  {
    key: "stock",
    section: "warehouse",
    icon: "Boxes",
    filters: ["range", "product"],
    async run(q) {
      const [onHand, moves] = await Promise.all([
        db.stockMovement.groupBy({ by: ["productId"], where: { product: { kind: "PRODUCT" }, ...(q.product ? { productId: q.product } : {}) }, _sum: { qty: true } }),
        db.stockMovement.groupBy({ by: ["productId", "type"], where: { product: { kind: "PRODUCT" }, createdAt: { gte: q.start, lt: q.end }, ...(q.product ? { productId: q.product } : {}) }, _sum: { qty: true } }),
      ]);
      const ids = [...new Set([...onHand.map((x) => x.productId), ...moves.map((x) => x.productId)])];
      const products = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } });
      const mv = (pid: string, type: string) => Number(moves.find((m) => m.productId === pid && m.type === type)?._sum.qty ?? 0);
      const rows: Row[] = products
        .map((p) => ({
          product: `${p.code} · ${p.name}`, produced: mv(p.id, "PRODUCTION"), rejected: -mv(p.id, "QC_REJECT"), out: -mv(p.id, "OUT"),
          adjusted: mv(p.id, "ADJUST"), stock: Number(onHand.find((o) => o.productId === p.id)?._sum.qty ?? 0),
        }))
        .sort((a, b) => b.stock - a.stock);
      return {
        columns: [
          { key: "product", label: "rep.col.product" },
          { key: "produced", label: "rep.col.inProduced", type: "int", total: true },
          { key: "rejected", label: "rep.col.outRejected", type: "int", total: true, wide: true },
          { key: "out", label: "rep.col.outShipped", type: "int", total: true },
          { key: "adjusted", label: "rep.col.adjusted", type: "signed", total: true, wide: true },
          { key: "stock", label: "rep.col.inStockNow", type: "int", total: true },
        ],
        rows,
        totals: true,
        chart: { label: "product", value: "stock" },
        kpis: [
          { label: "rep.kpi.stockNow", value: sum(rows, (r) => num(r.stock)), type: "int" },
          { label: "rep.kpi.producedPcs", value: sum(rows, (r) => num(r.produced)), type: "int" },
          { label: "rep.kpi.outPcs", value: sum(rows, (r) => num(r.out)), type: "int" },
        ],
      };
    },
  },

  // ─ Every stock movement
  {
    key: "movements",
    section: "warehouse",
    icon: "ArrowDownUp",
    filters: ["range", "product", "type"],
    typeFilter: { ns: "wh.mv", values: ["PRODUCTION", "USE", "QC_REJECT", "INPUT", "OUTPUT", "BUY", "SELL", "OUT", "ADJUST", "RECEIVE"] },
    async run(q) {
      const name = await userNames();
      const list = await db.stockMovement.findMany({
        where: { createdAt: { gte: q.start, lt: q.end }, ...(q.product ? { productId: q.product } : {}), ...(q.type ? { type: q.type as never } : {}) },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        include: { product: true },
      });
      const rows: Row[] = list.map((m) => ({
        at: m.createdAt, type: m.type, product: m.product.code, qty: Number(m.qty), reference: m.reference ?? m.reason, by: name(m.createdById),
        ...(m.docId || m.entryId ? { _href: (m.docId ? { reference: `/stock/${m.docId}` } : { product: `/qc/entries/${m.entryId}` }) as Record<string, string> } : {}),
      }));
      const typed = (t: string) => sum(list.filter((m) => m.type === t), (m) => Number(m.qty));
      return {
        columns: [
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "type", label: "rep.col.movement", type: "status", ns: "wh.mv", tones: MOVE_TONE },
          { key: "product", label: "rep.col.product", type: "code" },
          { key: "qty", label: "rep.col.qty", type: "signed", total: true },
          { key: "reference", label: "rep.col.reference" },
          { key: "by", label: "rep.col.by", wide: true },
        ],
        rows,
        totals: true,
        kpis: [
          { label: "rep.kpi.movements", value: rows.length, type: "int" },
          { label: "rep.kpi.producedPcs", value: typed("PRODUCTION"), type: "int" },
          { label: "rep.kpi.outPcs", value: -typed("OUT"), type: "int" },
          { label: "rep.kpi.rejectedPcs", value: -typed("QC_REJECT"), type: "int" },
        ],
      };
    },
  },

  // ─ Buying and selling (Stock movements: Buy / Sell), per line with prices
  {
    key: "trade",
    section: "warehouse",
    money: true,
    icon: "ArrowLeftRight",
    filters: ["range", "product", "type"],
    typeFilter: { ns: "sd.type", values: ["BUY", "SELL"] },
    async run(q) {
      const list = await db.stockMovement.findMany({
        where: { type: q.type ? (q.type as never) : { in: ["BUY", "SELL"] }, createdAt: { gte: q.start, lt: q.end }, ...(q.product ? { productId: q.product } : {}) },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        include: { product: { select: { code: true, name: true } }, doc: { select: { id: true, number: true, party: true, invoiceNo: true, currency: true, total: true, discount: true } } },
      });
      const rows: Row[] = list.map((m) => {
        const qty = Math.abs(Number(m.qty)), price = Number(m.unitPrice ?? 0);
        return {
          at: m.createdAt, doc: m.doc?.number ?? m.reference, type: m.type, party: m.doc?.party ?? "", invoice: m.doc?.invoiceNo ?? "",
          product: `${m.product.code} · ${m.product.name}`, qty, price, discount: Number(m.discount ?? 0) || null, total: Math.round((lineTotal(qty, price) - Number(m.discount ?? 0)) * 100) / 100, currency: m.doc?.currency ?? "",
          ...(m.doc ? { _href: { doc: `/stock/${m.doc.id}` } } : {}),
        };
      });
      // Totals per document (after invoice discounts), each document counted once.
      const docs = new Map(list.filter((m) => m.doc).map((m) => [m.doc!.id, { type: m.type, cur: m.doc!.currency ?? "", total: Number(m.doc!.total ?? 0) }]));
      // With one product chosen, its lines are what counts (invoice discounts can't be split per product).
      const tot = (type: string, cur: string) => Math.round((q.product
        ? sum(rows.filter((r) => r.type === type && r.currency === cur), (r) => num(r.total))
        : sum([...docs.values()].filter((d) => d.type === type && d.cur === cur), (d) => d.total)) * 100) / 100;
      return {
        columns: [
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "doc", label: "rep.col.document", type: "code" },
          { key: "type", label: "rep.col.movement", type: "status", ns: "sd.type", tones: MOVE_TONE },
          { key: "party", label: "rep.col.party" },
          { key: "invoice", label: "rep.col.invoice", wide: true },
          { key: "product", label: "rep.col.product" },
          { key: "qty", label: "rep.col.qty", type: "int" },
          { key: "price", label: "rep.col.unitPrice", type: "int", wide: true },
          { key: "discount", label: "rep.col.discount", type: "int", wide: true },
          { key: "total", label: "rep.col.amount", type: "int" },
          { key: "currency", label: "rep.col.currency" },
        ],
        rows,
        kpis: [
          { label: "rep.kpi.boughtIqd", value: tot("BUY", "IQD"), type: "int" },
          { label: "rep.kpi.boughtUsd", value: tot("BUY", "USD"), type: "int" },
          { label: "rep.kpi.soldIqd", value: tot("SELL", "IQD"), type: "int", tone: "good" },
          { label: "rep.kpi.soldUsd", value: tot("SELL", "USD"), type: "int", tone: "good" },
          ...(rows.some((r) => r.currency === "EUR") ? [
            { label: "rep.kpi.boughtEur", value: tot("BUY", "EUR"), type: "int" as const },
            { label: "rep.kpi.soldEur", value: tot("SELL", "EUR"), type: "int" as const, tone: "good" as const },
          ] : []),
        ],
      };
    },
  },
  // ─ The safe: every movement of money (cash:view only)
  {
    key: "cash",
    section: "money",
    icon: "Vault",
    perm: "cash:view",
    filters: ["range", "type"],
    typeFilter: { ns: "cash.kind", values: ["DEPOSIT", "EXPENSE", "SALE", "PURCHASE", "EXCHANGE", "TRANSFER"] },
    async run(q) {
      const [list, name] = await Promise.all([
        db.cashEntry.findMany({
          where: { ...(q.type ? { kind: q.type as never } : {}), createdAt: { gte: q.start, lt: q.end } },
          orderBy: { createdAt: "asc" }, take: MAX_ROWS,
          include: { category: true, safe: { select: { name: true } }, stockDoc: { select: { id: true, number: true } } },
        }),
        userNames(),
      ]);
      const rows: Row[] = list.map((e) => {
        const a = Number(e.amount);
        return {
          at: e.createdAt, number: e.number, kind: e.kind, safe: e.safe.name, category: e.category ? (e.category.key ?? `=${e.category.name}`) : "", party: e.party ?? "",
          doc: e.stockDoc?.number ?? "", note: e.note ?? "", in: a > 0 ? a : null, out: a < 0 ? -a : null, currency: e.currency, by: name(e.createdById),
          _href: { number: `/cash/${e.id}`, ...(e.stockDoc ? { doc: `/stock/${e.stockDoc.id}` } : {}) },
        };
      });
      const tot = (col: "in" | "out", cur: string) => Math.round(sum(rows.filter((r) => r.currency === cur), (r) => num(r[col])) * 100) / 100;
      const curs = ["IQD", "USD", "EUR"].filter((c) => c === "IQD" || rows.some((r) => r.currency === c));
      return {
        columns: [
          { key: "at", label: "rep.col.when", type: "datetime" },
          { key: "number", label: "rep.col.document", type: "code" },
          { key: "kind", label: "rep.col.movement", type: "status", ns: "cash.kind", tones: { DEPOSIT: "green", EXPENSE: "red", SALE: "purple", PURCHASE: "blue", EXCHANGE: "amber", TRANSFER: "gray" } },
          { key: "safe", label: "rep.col.safe" },
          { key: "category", label: "rep.col.expenseCat", type: "status", ns: "cash.cat" },
          { key: "party", label: "rep.col.party" },
          { key: "doc", label: "rep.col.forDoc", type: "code", wide: true },
          { key: "note", label: "rep.col.note", wide: true },
          { key: "in", label: "rep.col.moneyIn", type: "int" },
          { key: "out", label: "rep.col.moneyOut", type: "int" },
          { key: "currency", label: "rep.col.currency" },
          { key: "by", label: "rep.col.by", wide: true },
        ],
        rows,
        kpis: curs.flatMap((c) => [
          { label: `rep.kpi.in${c[0]}${c.slice(1).toLowerCase()}`, value: tot("in", c), type: "int" as const, tone: "good" as const },
          { label: `rep.kpi.out${c[0]}${c.slice(1).toLowerCase()}`, value: tot("out", c), type: "int" as const, tone: "bad" as const },
        ]),
      };
    },
  },
];

/** Whether this person may open the report (screen, CSV and PDF all use this). */
export function reportAllowed(def: ReportDef, perms: Set<string>) {
  if (def.perm && !perms.has(def.perm)) return false;
  if (def.money && !canSeeMoney({ permissions: perms })) return false;
  return true;
}

export const REPORT_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));
export const SECTIONS = ["production", "orders", "service", "quality", "warehouse", "money"] as const;

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
    product: pick("product", (v) => ID.test(v)),
    machine: pick("machine", (v) => ID.test(v)),
    status: pick("status", (v) => !!def.statusFilter?.values.includes(v)),
    priority: pick("priority", (v) => ["LOW", "NORMAL", "HIGH", "URGENT"].includes(v)),
    group: pick("group", (v) => !!def.groups?.includes(v)) ?? def.groups?.[0],
    severity: pick("severity", (v) => ["MINOR", "MAJOR", "CRITICAL"].includes(v)),
    type: pick("type", (v) => WORD.test(v) && !!def.typeFilter?.values.includes(v)),
  };
}

/** The filter values that are actually set, for URLs and export file names. */
export function queryParams(def: ReportDef, q: ReportQuery) {
  const p = new URLSearchParams();
  if (def.filters.includes("range")) { p.set("from", q.from); p.set("to", q.to); }
  for (const k of ["product", "machine", "status", "priority", "group", "severity", "type"] as const) {
    if (q[k] && def.filters.includes(k)) p.set(k, q[k]!);
  }
  return p;
}
