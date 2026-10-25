import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, FileSpreadsheet, Printer } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { toFactoryDateInput } from "@/lib/time";
import { REPORT_BY_KEY, parseQuery, queryParams, reportAllowed } from "@/lib/reports/registry";
import { describeFilters, filterSelects } from "@/lib/reports/context";
import type { T } from "@/lib/reports/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { BarChart, KpiRow, ReportTable } from "@/components/report-view";
import ReportFilters from "./report-filters";

const SCREEN_ROWS = 500;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = await getTranslations();
  return { title: REPORT_BY_KEY.has(key) ? t(`rep.r.${key}.title`) : "Report" };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await pageUser("reports:view");
  const { key } = await params;
  const def = REPORT_BY_KEY.get(key);
  if (!def || !reportAllowed(def, me.permissions)) notFound();
  const t = (await getTranslations()) as unknown as T;
  const locale = await getLocale();
  const q = parseQuery(def, await searchParams);
  const [result, selects] = await Promise.all([def.run(q), filterSelects(def, q, t)]);
  const qs = queryParams(def, q).toString();
  const summary = describeFilters(def, q, selects, t, locale);
  const exportable = can(me, "reports:export");
  const timeSeries = ["day", "week", "month"].includes(q.group ?? "");

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.reports")}
      </Link>
      <PageHeader
        title={t(`rep.r.${key}.title`)}
        subtitle={t(`rep.r.${key}.desc`)}
        actions={
          exportable && (
            <>
              <a href={`/api/reports/${key}?${qs}`} download className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
                <FileSpreadsheet className="size-4" /> {t("rep.csv")}
              </a>
              <a href={`/print/reports/${key}?${qs}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                <Printer className="size-4" /> {t("rep.pdf")}
              </a>
            </>
          )
        }
      />
      <ReportFilters range={def.filters.includes("range")} from={q.from} to={q.to} today={toFactoryDateInput(new Date())} selects={selects} />
      {summary.length > 0 && <p className="mb-3 text-xs text-muted">{summary.join(" · ")}</p>}

      <div className="space-y-4">
        <KpiRow kpis={result.kpis} t={t} locale={locale} />
        {result.rows.length === 0 ? (
          <EmptyState>{t("rep.noData")}</EmptyState>
        ) : (
          <>
            {result.chart && <BarChart result={result} t={t} locale={locale} timeSeries={timeSeries} title={`${t(result.columns.find((c) => c.key === result.chart!.value)!.label)} · ${t(result.columns[0].label)}`} />}
            <ReportTable result={result} t={t} locale={locale} limit={SCREEN_ROWS} />
            <p className="text-xs text-muted">
              {result.rows.length > SCREEN_ROWS ? t("rep.rowsLimited", { n: SCREEN_ROWS, total: result.rows.length }) : t("rep.rows", { n: result.rows.length })}
            </p>
          </>
        )}
      </div>
    </>
  );
}
