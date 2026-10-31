import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SHIFTS, SHIFT_NO } from "@/lib/workers";
import { todayYmd } from "@/lib/production";
import { Card, PageHeader } from "@/components/ui";
import WorkersNav from "../../workers-nav";

export const metadata = { title: "Salary sheets" };

/** Choose month, year and ONE shift, preview the sheet, then print it from the preview. */
export default async function SheetsPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; shift?: string }> }) {
  const me = await pageUser("payroll:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const now = todayYmd();
  const year = Number(sp.year) >= 2024 && Number(sp.year) <= 2100 ? Number(sp.year) : Number(now.slice(0, 4));
  const month = Number(sp.month) >= 1 && Number(sp.month) <= 12 ? Number(sp.month) : Number(now.slice(5, 7));
  const shift = (SHIFTS as readonly string[]).includes(sp.shift ?? "") ? sp.shift! : "A";
  const run = await db.payrollRun.findUnique({ where: { year_month: { year, month } }, select: { state: true } });
  const src = `/print/salary-sheet?year=${year}&month=${month}&shift=${shift}`;
  const sel = "min-h-10 rounded-lg border border-line bg-surface px-3 text-sm";
  return (
    <>
      <PageHeader title={t("wk.tab.sheets")} subtitle={t("wk.sheetsIntro")} />
      <WorkersNav me={me} active="sheets" />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-2" action="/workers/payroll/sheets">
          <label className="text-sm font-medium">{t("wk.year")}<select name="year" defaultValue={year} className={`${sel} mt-1 block`} aria-label={t("wk.year")}>{Array.from({ length: 4 }, (_, i) => Number(now.slice(0, 4)) - i).map((y) => <option key={y}>{y}</option>)}</select></label>
          <label className="text-sm font-medium">{t("wk.month")}<select name="month" defaultValue={month} className={`${sel} mt-1 block`} aria-label={t("wk.month")}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{t("wk.monthN", { n: i + 1 })}</option>)}</select></label>
          <label className="text-sm font-medium">{t("wk.shift")}<select name="shift" defaultValue={shift} className={`${sel} mt-1 block`} aria-label={t("wk.shift")}>{SHIFTS.map((s) => <option key={s} value={s}>{t("wk.shiftN", { n: SHIFT_NO[s] })}</option>)}</select></label>
          <button className="min-h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white">{t("wk.preview")}</button>
          <a href={src} target="_blank" className="min-h-10 rounded-lg border border-line px-4 py-2 text-sm font-semibold" data-testid="open-sheet">{t("wk.openToPrint")}</a>
        </form>
        <p className="mt-2 text-xs text-muted">{run && run.state !== "DRAFT" ? t("wk.sheetFrozen", { state: t(`wk.run.${run.state}`) }) : t("wk.sheetDraft")}</p>
      </Card>
      <iframe src={src} title={t("wk.preview")} className="h-[80vh] w-full rounded-lg border border-line bg-white" />
    </>
  );
}
