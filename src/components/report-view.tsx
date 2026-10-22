import Link from "next/link";
import { Badge, cn } from "@/components/ui";
import { cellText, kpiText, totalsRow, type T } from "@/lib/reports/format";
import type { Column, Kpi, ReportResult, Row } from "@/lib/reports/types";

const NUMERIC = new Set(["int", "signed", "pct", "hours", "days"]);

export function KpiRow({ kpis, t, locale, print }: { kpis: Kpi[]; t: T; locale: string; print?: boolean }) {
  return (
    <div className={cn("grid gap-2", print ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5")}>
      {kpis.map((k) => (
        <div key={k.label} className={cn("rounded-xl border p-3", print ? "border-gray-300" : "border-line bg-surface")}>
          <p className={cn("text-xs", print ? "text-gray-600" : "text-muted")}>{t(k.label)}</p>
          <p
            className={cn(
              "mt-1 text-xl font-bold tabular-nums sm:text-2xl",
              !print && k.tone === "bad" && Number(k.value) > 0 && "text-red-600 dark:text-red-400",
              !print && k.tone === "warn" && Number(k.value) > 0 && "text-amber-600 dark:text-amber-400",
              !print && k.tone === "good" && Number(k.value) > 0 && "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {kpiText(k, t, locale)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * One-series bar chart. Periods (days/weeks/months) are drawn as columns in time order;
 * categories (machines, products…) as ranked horizontal bars. Every bar has a hover
 * tooltip and the exact numbers are always in the table underneath.
 */
export function BarChart({ result, t, locale, timeSeries, title }: { result: ReportResult; t: T; locale: string; timeSeries: boolean; title: string }) {
  const chart = result.chart!;
  const labelCol = result.columns.find((c) => c.key === chart.label)!;
  const valCol: Column = { key: chart.value, label: "", type: chart.type ?? "int" };
  const pts = result.rows.map((r) => ({ label: cellText(labelCol, r[chart.label], t, locale), v: Number(r[chart.value] ?? 0) }));
  const max = Math.max(...pts.map((p) => p.v), 0);
  if (pts.length === 0 || max <= 0) return null;

  if (timeSeries) {
    const step = Math.max(1, Math.ceil(pts.length / 8));
    return (
      <figure className="rounded-2xl border border-line bg-surface p-4">
        <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted">{t("rep.chartMax", { v: cellText(valCol, max, t, locale) })}</span>
        </figcaption>
        <div dir="ltr">
          <div className="relative flex h-44 items-end gap-[2px] border-b border-line" role="img" aria-label={title}>
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
            {pts.map((p, i) => (
              <div key={i} className="group relative flex h-full max-w-14 min-w-0 flex-1 items-end">
                <div
                  className="w-full rounded-t-[4px] bg-brand-600 transition-colors group-hover:bg-brand-800 dark:bg-brand-400 dark:group-hover:bg-brand-200"
                  style={{ height: p.v > 0 ? `max(2px, ${(p.v / max) * 100}%)` : 0 }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-surface shadow group-hover:block">
                  {p.label}: <b>{cellText(valCol, p.v, t, locale)}</b>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-muted">
            {pts.map((p, i) => (
              <span key={i} className="max-w-14 min-w-0 flex-1 overflow-visible whitespace-nowrap">{i % step === 0 ? p.label.slice(5) || p.label : ""}</span>
            ))}
          </div>
        </div>
      </figure>
    );
  }

  const top = pts.slice(0, 12);
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4">
      <figcaption className="mb-3 text-sm font-semibold">{title}</figcaption>
      <ul className="space-y-1.5" role="img" aria-label={title}>
        {top.map((p, i) => (
          <li key={i} className="group grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-2 text-xs" title={`${p.label}: ${cellText(valCol, p.v, t, locale)}`}>
            <span className="truncate text-muted">{p.label}</span>
            <span className="h-4 rounded-e-[4px] bg-brand-600 transition-colors group-hover:bg-brand-800 dark:bg-brand-400 dark:group-hover:bg-brand-200" style={{ width: `${Math.max((p.v / max) * 100, 1)}%` }} />
            <span className="font-semibold tabular-nums">{cellText(valCol, p.v, t, locale)}</span>
          </li>
        ))}
      </ul>
      {pts.length > top.length && <p className="mt-2 text-xs text-muted">{t("rep.chartTop", { n: top.length, total: pts.length })}</p>}
    </figure>
  );
}

export function ReportTable({ result, t, locale, limit, print }: { result: ReportResult; t: T; locale: string; limit?: number; print?: boolean }) {
  const { columns, rows } = result;
  const shown = limit ? rows.slice(0, limit) : rows;
  const totals = result.totals && rows.length > 1 ? totalsRow(columns, rows) : null;
  const hideSm = (c: Column) => (!print && c.wide ? "hidden md:table-cell" : "");
  const align = (c: Column) => (NUMERIC.has(c.type ?? "text") ? "text-end tabular-nums" : "text-start");
  const border = print ? "border border-gray-300" : "";

  const cell = (c: Column, r: Row) => {
    const v = r[c.key];
    const text = cellText(c, v, t, locale);
    if (c.type === "status" && c.tones && v && !print) return <Badge tone={c.tones[String(v)] ?? "gray"}>{text}</Badge>;
    const href = r._href?.[c.key];
    const content = c.type === "code" ? <span dir="ltr" className="font-mono text-[0.8rem]">{text}</span> : text;
    if (href && !print && text !== "—") return <Link href={href} className="font-semibold text-brand-600 hover:underline dark:text-brand-300">{content}</Link>;
    if (c.type === "signed" && Number(v) < 0) return <span className="text-red-600 dark:text-red-400">{content}</span>;
    return content;
  };

  return (
    <div className={cn(!print && "overflow-x-auto rounded-2xl border border-line bg-surface")}>
      <table className={cn("w-full border-collapse text-sm", print && "text-[11px]")}>
        <thead>
          <tr className={print ? "bg-[#eef2fa]" : "border-b border-line bg-surface-2 text-xs text-muted"}>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3 py-2 font-semibold", !print && "whitespace-nowrap", align(c), hideSm(c), border, print && "px-1.5 py-1")}>
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={print ? "" : "divide-y divide-line"}>
          {shown.map((r, i) => (
            <tr key={i} className={print ? "break-inside-avoid" : "hover:bg-surface-2"}>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2", align(c), hideSm(c), border, print && "px-1.5 py-1", print ? (c.type === "code" || c.type === "date" ? "whitespace-nowrap" : "") : c.key === "reason" || c.key === "action" || c.key === "title" ? "min-w-48" : "whitespace-nowrap")}>
                  {cell(c, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className={cn("font-bold", print ? "bg-gray-100" : "border-t-2 border-line bg-surface-2")}>
              {columns.map((c, i) => (
                <td key={c.key} className={cn("px-3 py-2 whitespace-nowrap", align(c), hideSm(c), border, print && "px-1.5 py-1")}>
                  {i === 0 ? t("rep.total") : c.total ? cellText(c, totals[c.key], t, locale) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
