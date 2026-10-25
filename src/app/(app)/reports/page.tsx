import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowDownUp, ArrowLeftRight, Boxes, Bug, ChevronRight, ClipboardCheck, ClipboardPen, Factory, ListChecks,
  ShieldCheck, Target, Vault, Wrench, type LucideIcon,
} from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { REPORTS, SECTIONS, reportAllowed } from "@/lib/reports/registry";
import { Alert, PageHeader } from "@/components/ui";

export const metadata = { title: "Reports & Analytics" };

const ICONS: Record<string, LucideIcon> = {
  Factory, Target, ClipboardCheck, ListChecks, Wrench, ArrowLeftRight, ShieldCheck, Bug, ClipboardPen, Boxes, ArrowDownUp, Vault,
};

export default async function ReportsPage() {
  const me = await pageUser("reports:view");
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("nav.reports")} subtitle={t("rep.intro")} />
      {!can(me, "reports:export") && <div className="mb-4"><Alert tone="blue">{t("rep.noExport")}</Alert></div>}
      <div className="space-y-6">
        {SECTIONS.filter((sec) => REPORTS.some((r) => r.section === sec && reportAllowed(r, me.permissions))).map((sec) => (
          <section key={sec}>
            <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t(`rep.sec.${sec}`)}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {REPORTS.filter((r) => r.section === sec && reportAllowed(r, me.permissions)).map((r) => {
                const Icon = ICONS[r.icon] ?? Factory;
                return (
                  <li key={r.key}>
                    <Link href={`/reports/${r.key}`} className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand-300 hover:bg-surface-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-200">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t(`rep.r.${r.key}.title`)}</span>
                        <span className="mt-0.5 block text-sm text-muted">{t(`rep.r.${r.key}.desc`)}</span>
                      </span>
                      <ChevronRight className="mt-2 size-4 shrink-0 text-muted rtl:rotate-180" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
