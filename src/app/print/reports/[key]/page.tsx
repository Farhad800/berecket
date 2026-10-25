import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatDateTime } from "@/lib/time";
import { REPORT_BY_KEY, parseQuery, queryParams, reportAllowed } from "@/lib/reports/registry";
import { describeFilters, filterSelects } from "@/lib/reports/context";
import type { T } from "@/lib/reports/format";
import { KpiRow, ReportTable } from "@/components/report-view";
import PrintButton from "@/components/print-button";

export const metadata = { title: "Report" };

/** Printable A4 version of a report — "Save as PDF" from the print dialog gives the PDF. */
export default async function PrintReport({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await pageUser("reports:export");
  const { key } = await params;
  const def = REPORT_BY_KEY.get(key);
  if (!def || !reportAllowed(def, me.permissions)) notFound();
  const t = (await getTranslations()) as unknown as T;
  const locale = await getLocale();
  const q = parseQuery(def, await searchParams);
  const [result, selects] = await Promise.all([def.run(q), filterSelects(def, q, t)]);
  const summary = describeFilters(def, q, selects, t, locale);
  const landscape = result.columns.length > 7;
  await audit({ userId: me.id, action: "report.export", entityType: "Report", entityId: key, after: { format: "pdf", ...Object.fromEntries(queryParams(def, q)), rows: result.rows.length } });

  return (
    <main className={`mx-auto bg-white p-6 text-black print:p-0 ${landscape ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm } @media print { body { background: white } .no-print { display: none } thead { display: table-header-group } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">{t("rep.pdfHint")}</p>
        <PrintButton label={t("rep.printSave")} />
      </div>
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#294680] pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bereket-logo.jpg" alt="Bereket Plastic" width={70} height={65} className="rounded-lg" />
          <div>
            <p className="text-lg font-bold text-[#294680]">Bereket Plastic</p>
            <p className="text-xs text-gray-600">{t("app.system")}</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-xl font-bold">{t(`rep.r.${key}.title`)}</p>
          {summary.map((s) => <p key={s} className="text-xs text-gray-700">{s}</p>)}
        </div>
      </header>
      <div className="my-4"><KpiRow kpis={result.kpis} t={t} locale={locale} print /></div>
      {result.rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-600">{t("rep.noData")}</p> : <ReportTable result={result} t={t} locale={locale} print />}
      <footer className="mt-4 flex justify-between border-t border-gray-300 pt-2 text-[10px] text-gray-500">
        <span>{t("rep.printedBy", { name: me.fullName, at: formatDateTime(new Date(), locale) })}</span>
        <span>{t("rep.rows", { n: result.rows.length })}</span>
      </footer>
    </main>
  );
}
