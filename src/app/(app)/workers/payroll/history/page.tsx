import { redirect } from "next/navigation";
import { maySeeSalaries } from "@/lib/workers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import WorkersNav from "../../workers-nav";

export const metadata = { title: "Payroll history" };
const iqd = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });

/** Every month's payroll: state, who submitted / approved / finalized it, employees and total. */
export default async function PayrollHistoryPage() {
  const me = await pageUser("payroll:view");
  if (!maySeeSalaries(me)) redirect("/forbidden"); // salaries only with the "see money" rule
  const t = await getTranslations();
  const locale = await getLocale();
  const runs = await db.payrollRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], include: { lines: { select: { finalSalary: true } } } });
  const users = await db.user.findMany({ select: { id: true, fullName: true } });
  const who = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";
  return (
    <>
      <PageHeader title={t("wk.tab.history")} subtitle={t("wk.historyIntro")} />
      <WorkersNav me={me} active="history" />
      {runs.length === 0 ? <EmptyState>{t("wk.noRuns")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/workers/payroll?year=${r.year}&month=${r.month}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-surface-2">
                  <div>
                    <p className="font-semibold">{t("wk.payrollOf", { month: r.month, year: r.year })} <Badge className="ms-2" tone={r.state === "FINALIZED" ? "green" : r.state === "APPROVED" ? "blue" : r.state === "SUBMITTED" ? "amber" : "gray"}>{t(`wk.run.${r.state}`)}</Badge></p>
                    <p className="text-xs text-muted">
                      {r.submittedAt && t("wk.runSubmitted", { name: who(r.submittedById), at: formatDateTime(r.submittedAt, locale) })}
                      {r.approvedAt && ` · ${t("wk.runApproved", { name: who(r.approvedById), at: formatDateTime(r.approvedAt, locale) })}`}
                      {r.finalizedAt && ` · ${t("wk.runFinalized", { name: who(r.finalizedById), at: formatDateTime(r.finalizedAt, locale) })}`}
                    </p>
                  </div>
                  <span className="self-center text-end text-sm"><b dir="ltr">{iqd(r.lines.reduce((s, l) => s + Number(l.finalSalary), 0))} IQD</b><span className="block text-xs text-muted">{t("wk.employeesCount", { n: r.lines.length })}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
