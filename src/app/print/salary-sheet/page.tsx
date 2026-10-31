import type { Shift } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SHIFTS, SHIFT_NO } from "@/lib/workers";
import { payrollView } from "@/lib/payroll-view";
import { formatDate } from "@/lib/time";
import PrintButton from "@/components/print-button";

export const metadata = { title: "Monthly Employee Salary Sheet" };
const iqd = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });

/**
 * A4 salary receipt sheet for ONE shift and month: a large empty signature box per employee, the shift total,
 * and the manager / accountant approval boxes. Printing records nothing as paid and changes no figure.
 * Once the month is submitted, the frozen figures are printed, so a reprint years later is the same.
 */
export default async function SalarySheet({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; shift?: string }> }) {
  const me = await pageUser("payroll:view");
  const sp = await searchParams;
  const year = Number(sp.year), month = Number(sp.month);
  if (!(year >= 2024 && year <= 2100 && month >= 1 && month <= 12) || !(SHIFTS as readonly string[]).includes(sp.shift ?? "")) notFound();
  const shift = sp.shift as Shift;
  const t = await getTranslations();
  const locale = await getLocale();
  const { run, frozen, lines } = await payrollView(year, month, { shift });
  const total = lines.reduce((s, l) => s + l.finalSalary, 0);
  await audit({ userId: me.id, action: "payroll.print", entityType: "PayrollRun", entityId: run?.id ?? null, after: { month: `${month}/${year}`, shift: SHIFT_NO[shift], employees: lines.length, frozen } });
  const rtl = locale === "ar";
  const cell = "border border-black px-2 py-1";
  return (
    <main dir={rtl ? "rtl" : "ltr"} className="mx-auto max-w-[210mm] bg-white p-6 text-black print:p-0" data-testid="salary-sheet">
      <style>{`@page { size: A4 portrait; margin: 10mm } @media print { body { background: white } .no-print { display: none } thead { display: table-header-group } tfoot { display: table-row-group } tr { break-inside: avoid; page-break-inside: avoid } .keep { break-inside: avoid; page-break-inside: avoid } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">{frozen ? t("wk.sheetFrozen", { state: t(`wk.run.${run!.state}`) }) : t("wk.sheetDraft")}</p>
        <PrintButton label={t("rep.printSave")} />
      </div>
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#294680] pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bereket-logo.jpg" alt="Bereket Plastic" width={70} height={65} className="rounded-lg" />
          <div><p className="text-lg font-bold text-[#294680]">Bereket Plastic</p><p className="text-xs text-gray-600">{t("wk.factory")}</p></div>
        </div>
        <div className="text-end">
          <p className="text-xl font-bold">{t("wk.sheetTitle")}</p>
          <p className="text-sm">{t("wk.payrollOf", { month, year })} · <b>{t("wk.shiftN", { n: SHIFT_NO[shift] })}</b></p>
          <p className="text-xs text-gray-600">{t("wk.printDate")}: {formatDate(new Date(), locale)}</p>
          {!frozen && <p className="text-xs font-bold text-red-700">{t("wk.draftMark")}</p>}
        </div>
      </header>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className={`${cell} w-10`}>{t("wk.sheet.no")}</th>
            <th className={`${cell} text-start`}>{t("wk.sheet.name")}</th>
            <th className={cell}>{t("wk.sheet.id")}</th>
            <th className={cell}>{t("wk.sheet.days")}</th>
            <th className={cell}>{t("wk.sheet.final")}</th>
            <th className={`${cell} w-[45mm]`}>{t("wk.sheet.signature")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.workerId} data-testid="sheet-row">
              <td className={`${cell} text-center`}>{i + 1}</td>
              <td className={cell}>{l.name}</td>
              <td className={`${cell} text-center`} dir="ltr">{l.number}</td>
              <td className={`${cell} text-center`}>{l.daysWorked}</td>
              <td className={`${cell} text-end font-semibold`} dir="ltr">{iqd(l.finalSalary)}</td>
              <td className={`${cell} h-[22mm]`} data-testid="signature-box" />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold">
            <td className={cell} colSpan={4}>{t("wk.sheet.total", { n: lines.length })}</td>
            <td className={`${cell} text-end text-base`} dir="ltr" data-testid="sheet-total">{iqd(total)} IQD</td>
            <td className={cell} />
          </tr>
        </tfoot>
      </table>
      <section className="keep mt-6 grid grid-cols-2 gap-6 text-sm">
        <div className="rounded border border-black p-3">
          <p className="font-bold">{t("wk.sheet.manager")}</p>
          <p className="mt-3">{t("wk.sheet.name2")}: ______________________</p>
          <p className="mt-3">{t("wk.sheet.approvalDate")}: ______________________</p>
          <p className="mt-3">{t("wk.sheet.signature")}:</p><div className="mt-1 h-[22mm] border border-dashed border-gray-500" />
        </div>
        <div className="rounded border border-black p-3">
          <p className="font-bold">{t("wk.sheet.accountant")}</p>
          <p className="mt-3">{t("wk.sheet.name2")}: ______________________</p>
          <p className="mt-3">{t("wk.sheet.date")}: ______________________</p>
          <p className="mt-3">{t("wk.sheet.signature")}:</p><div className="mt-1 h-[22mm] border border-dashed border-gray-500" />
        </div>
      </section>
      <p className="mt-3 text-[10px] text-gray-500">{t("wk.sheet.note")}</p>
    </main>
  );
}
