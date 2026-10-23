import "server-only";
import { db } from "@/lib/db";
import { formatDate, parseFactoryDate } from "@/lib/time";
import type { T } from "./format";
import type { ReportDef, ReportQuery } from "./types";

export type Option = { value: string; label: string };
export type SelectDef = { name: string; label: string; value: string; options: Option[]; allLabel: string };

/** Builds the dropdowns a report needs, with translated labels. */
export async function filterSelects(def: ReportDef, q: ReportQuery, t: T): Promise<SelectDef[]> {
  const f = def.filters;
  const [products, machines] = await Promise.all([
    f.includes("product") ? db.product.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }) : [],
    f.includes("machine") ? db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }) : [],
  ]);
  const out: SelectDef[] = [];
  const add = (name: keyof ReportQuery, label: string, allLabel: string, options: Option[]) =>
    out.push({ name, label, allLabel, value: String(q[name] ?? ""), options });

  if (def.groups) add("group", t("rep.f.groupBy"), "", def.groups.map((g) => ({ value: g, label: t(`rep.group.${g}`) })));
  if (f.includes("product")) add("product", t("rep.col.product"), t("rep.f.allProducts"), products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })));
  if (f.includes("machine")) add("machine", t("rep.col.machine"), t("rep.f.allMachines"), machines.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` })));
  if (def.statusFilter) add("status", t("rep.col.status"), t("rep.f.defaultStatus"), def.statusFilter.values.map((v) => ({ value: v, label: t(`${def.statusFilter!.ns}.${v}`) })));
  if (def.typeFilter) add("type", t("rep.col.movement"), t("rep.f.allTypes"), def.typeFilter.values.map((v) => ({ value: v, label: t(`${def.typeFilter!.ns}.${v}`) })));
  if (f.includes("priority")) add("priority", t("rep.col.priority"), t("rep.f.allPriorities"), ["LOW", "NORMAL", "HIGH", "URGENT"].map((v) => ({ value: v, label: t(`status.priority.${v}`) })));
  if (f.includes("severity")) add("severity", t("rep.col.severity"), t("rep.f.allSeverities"), ["CRITICAL", "MAJOR", "MINOR"].map((v) => ({ value: v, label: t(`status.severity.${v}`) })));
  return out;
}

/** Human summary of the filters, printed on the PDF and shown under the title. */
export function describeFilters(def: ReportDef, q: ReportQuery, selects: SelectDef[], t: T, locale: string): string[] {
  const parts: string[] = [];
  if (def.filters.includes("range")) parts.push(t("rep.f.period", { from: formatDate(parseFactoryDate(q.from), locale), to: formatDate(parseFactoryDate(q.to), locale) }));
  for (const s of selects) {
    if (!s.value) continue;
    const o = s.options.find((x) => x.value === s.value);
    if (o) parts.push(`${s.label}: ${o.label}`);
  }
  return parts;
}
