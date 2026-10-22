import "server-only";
import type { Tone } from "@/components/ui";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import type { Permission } from "./permissions";
import { STATUS_TONE } from "./orders";
import { ISSUE_TONE, JOB_TONE, MAINT_TONE, QC_TONE, SHIP_TONE } from "./tones";

export type Hit = {
  title: string; // record number / code
  sub?: string;
  href: string;
  status?: { ns: string; value: string; tone: Tone };
  exact: boolean; // the query is exactly this record's number or code
};
export type SearchGroup = { kind: string; hits: Hit[] };

const TAKE = 8;
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const same = (a: string | null | undefined, q: string) => !!a && a.toLowerCase() === q.toLowerCase();

/**
 * One search across every kind of record the spec lists: order, customer, product code,
 * batch, machine, mold, quality issue, maintenance request and shipment (plus jobs,
 * service reports, inspections and receipts, which share the same numbering).
 * Each group only runs if the user may view that kind of record.
 */
export async function globalSearch(raw: string, me: CurrentUser): Promise<SearchGroup[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const may = (p: Permission) => me.permissions.has(p);
  const skip = Promise.resolve([] as Hit[]);

  const tasks: [string, Promise<Hit[]>][] = [
    ["orders", !may("orders:view") ? skip : db.order.findMany({
      where: { OR: [{ number: ci(q) }, { customerReference: ci(q) }, { customer: { name: ci(q) } }] },
      orderBy: { createdAt: "desc" }, take: TAKE,
      select: { id: true, number: true, status: true, customerReference: true, customer: { select: { name: true } } },
    }).then((r) => r.map((o) => ({
      title: o.number, sub: [o.customer.name, o.customerReference].filter(Boolean).join(" · "), href: `/orders/${o.id}`,
      status: { ns: "status.order", value: o.status, tone: STATUS_TONE[o.status] }, exact: same(o.number, q) || same(o.customerReference, q),
    })))],
    ["customers", !may("customers:view") ? skip : db.customer.findMany({
      where: { OR: [{ code: ci(q) }, { name: ci(q) }, { phone: ci(q) }, { contactName: ci(q) }] }, orderBy: { name: "asc" }, take: TAKE,
      select: { id: true, code: true, name: true, phone: true },
    }).then((r) => r.map((c) => ({ title: c.name, sub: [c.code, c.phone].filter(Boolean).join(" · "), href: `/orders?customer=${c.id}`, exact: same(c.code, q) })))],
    ["products", !may("products:view") ? skip : db.product.findMany({
      where: { OR: [{ code: ci(q) }, { name: ci(q) }] }, orderBy: { code: "asc" }, take: TAKE, select: { code: true, name: true },
    }).then((r) => r.map((p) => ({ title: p.code, sub: p.name, href: `/products?q=${encodeURIComponent(p.code)}`, exact: same(p.code, q) })))],
    ["batches", !may("qc:view") ? skip : db.batch.findMany({
      where: { number: ci(q) }, orderBy: { createdAt: "desc" }, take: TAKE,
      select: { id: true, number: true, qcStatus: true, product: { select: { code: true } }, orderLine: { select: { order: { select: { number: true } } } } },
    }).then((r) => r.map((b) => ({
      title: b.number, sub: `${b.product.code} · ${b.orderLine.order.number}`, href: `/qc/batches/${b.id}`,
      status: { ns: "status.qc", value: b.qcStatus, tone: QC_TONE[b.qcStatus] }, exact: same(b.number, q),
    })))],
    ["jobs", !may("production:view") ? skip : db.productionJob.findMany({
      where: { number: ci(q) }, orderBy: { createdAt: "desc" }, take: TAKE,
      select: { id: true, number: true, status: true, machine: { select: { code: true } }, orderLine: { select: { product: { select: { code: true } } } } },
    }).then((r) => r.map((j) => ({
      title: j.number, sub: [j.orderLine.product.code, j.machine?.code].filter(Boolean).join(" · "), href: `/production/${j.id}`,
      status: { ns: "status.job", value: j.status, tone: JOB_TONE[j.status] }, exact: same(j.number, q),
    })))],
    ["machines", !may("assets:view") ? skip : db.machine.findMany({
      where: { OR: [{ code: ci(q) }, { name: ci(q) }, { model: ci(q) }] }, orderBy: { code: "asc" }, take: TAKE, select: { id: true, code: true, name: true, status: true },
    }).then((r) => r.map((m) => ({
      title: m.code, sub: m.name, href: `/history?machine=${m.id}`,
      status: { ns: "status.machine", value: m.status, tone: (m.status === "DOWN" ? "red" : m.status === "RUNNING" ? "purple" : m.status === "MAINTENANCE" ? "amber" : "green") as Tone },
      exact: same(m.code, q),
    })))],
    ["molds", !may("assets:view") ? skip : db.mold.findMany({
      where: { OR: [{ code: ci(q) }, { name: ci(q) }] }, orderBy: { code: "asc" }, take: TAKE,
      select: { id: true, code: true, name: true, currentMachine: { select: { code: true } } },
    }).then((r) => r.map((m) => ({ title: m.code, sub: [m.name, m.currentMachine?.code].filter(Boolean).join(" · "), href: `/history?mold=${m.id}`, exact: same(m.code, q) })))],
    ["issues", !may("qc:view") ? skip : db.qualityIssue.findMany({
      where: { OR: [{ number: ci(q) }, { description: ci(q) }, { batch: { number: ci(q) } }] }, orderBy: { createdAt: "desc" }, take: TAKE,
      select: { id: true, number: true, status: true, description: true, batch: { select: { number: true } } },
    }).then((r) => r.map((i) => ({
      title: i.number, sub: `${i.batch.number} · ${i.description.slice(0, 80)}`, href: `/qc/issues/${i.id}`,
      status: { ns: "status.issue", value: i.status, tone: ISSUE_TONE[i.status] }, exact: same(i.number, q),
    })))],
    ["inspections", !may("qc:view") ? skip : db.qcInspection.findMany({
      where: { number: ci(q) }, orderBy: { inspectedAt: "desc" }, take: TAKE, select: { number: true, decision: true, batchId: true, batch: { select: { number: true } } },
    }).then((r) => r.map((i) => ({ title: i.number, sub: i.batch.number, href: `/qc/batches/${i.batchId}`, exact: same(i.number, q) })))],
    ["requests", !may("maintenance:view") ? skip : db.maintenanceRequest.findMany({
      where: { OR: [{ number: ci(q) }, { title: ci(q) }] }, orderBy: { createdAt: "desc" }, take: TAKE,
      select: { id: true, number: true, title: true, status: true, machine: { select: { code: true } } },
    }).then((r) => r.map((m) => ({
      title: m.number, sub: `${m.machine.code} · ${m.title}`, href: `/service/requests/${m.id}`,
      status: { ns: "status.maint", value: m.status, tone: MAINT_TONE[m.status] }, exact: same(m.number, q),
    })))],
    ["serviceReports", !may("service:view") ? skip : db.serviceReport.findMany({
      where: { number: ci(q) }, orderBy: { createdAt: "desc" }, take: TAKE, select: { id: true, number: true, workPerformed: true, machine: { select: { code: true } } },
    }).then((r) => r.map((s) => ({ title: s.number, sub: `${s.machine.code} · ${s.workPerformed.slice(0, 80)}`, href: `/service/reports/${s.id}`, exact: same(s.number, q) })))],
    ["shipments", !may("shipments:view") ? skip : db.shipment.findMany({
      where: { OR: [{ number: ci(q) }, { deliveryNote: ci(q) }, { vehicle: ci(q) }] }, orderBy: { createdAt: "desc" }, take: TAKE,
      select: { id: true, number: true, deliveryNote: true, status: true, customer: { select: { name: true } } },
    }).then((r) => r.map((s) => ({
      title: s.deliveryNote ? `${s.number} · ${s.deliveryNote}` : s.number, sub: s.customer.name, href: `/shipments/${s.id}`,
      status: { ns: "status.ship", value: s.status, tone: SHIP_TONE[s.status] }, exact: same(s.number, q) || same(s.deliveryNote, q),
    })))],
    ["receipts", !may("warehouse:view") ? skip : db.warehouseReceipt.findMany({
      where: { number: ci(q) }, orderBy: { receivedAt: "desc" }, take: TAKE, select: { number: true, qtyReceived: true, batchId: true, batch: { select: { number: true } } },
    }).then((r) => r.map((x) => ({ title: x.number, sub: `${x.batch.number} · ${x.qtyReceived}`, href: `/qc/batches/${x.batchId}`, exact: same(x.number, q) })))],
  ];

  const results = await Promise.all(tasks.map(([, p]) => p));
  return tasks.map(([kind], i) => ({ kind, hits: results[i] })).filter((g) => g.hits.length > 0);
}
