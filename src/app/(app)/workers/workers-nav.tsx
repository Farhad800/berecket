import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can, type CurrentUser } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/components/ui";

const TABS: { key: string; href: string; perm: Permission | Permission[] }[] = [
  { key: "active", href: "/workers", perm: "workers:view" },
  { key: "inactive", href: "/workers/inactive", perm: "workers:view" },
  { key: "blacklist", href: "/workers/blacklist", perm: "blacklist:view" },
  { key: "shifts", href: "/workers/shifts", perm: "workers:view" },
  { key: "attendance", href: "/workers/attendance", perm: "workers:view" },
  { key: "excuses", href: "/workers/excuses", perm: "workers:view" },
  { key: "penalties", href: "/workers/penalties", perm: "workers:view" },
  { key: "payroll", href: "/workers/payroll", perm: "payroll:view" },
  { key: "sheets", href: "/workers/payroll/sheets", perm: "payroll:view" },
  { key: "history", href: "/workers/payroll/history", perm: "payroll:view" },
];

/** The ten sections of Employee Management; each shows only to people allowed to open it. */
export default async function WorkersNav({ me, active }: { me: CurrentUser; active: string }) {
  const t = await getTranslations();
  const tabs = TABS.filter((x) => (Array.isArray(x.perm) ? x.perm.some((p) => can(me, p)) : can(me, x.perm)));
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label={t("nav.workers")}>
      {tabs.map((x) => (
        <Link key={x.key} href={x.href} aria-current={active === x.key ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap", active === x.key ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted hover:text-ink")}>
          {t(`wk.tab.${x.key}`)}
        </Link>
      ))}
    </nav>
  );
}
