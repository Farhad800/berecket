import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AlertOctagon, Boxes, CalendarDays, ClipboardList, Factory, PackageMinus, Package, ShieldAlert, ShieldX, SearchCheck, Wrench, ShieldQuestion, Vault, type LucideIcon,
} from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { balances } from "@/lib/cash";
import { getDashboard } from "@/lib/dashboard";
import { formatDateTime, formatNumber } from "@/lib/time";
import { Card, PageHeader, cn } from "@/components/ui";

export const metadata = { title: "Dashboard" };

type CardDef = { key: string; href: string; icon: LucideIcon; alert?: boolean };

const GROUPS: { title: string; cards: CardDef[] }[] = [
  { title: "nav.orders", cards: [
    { key: "openOrders", href: "/orders", icon: ClipboardList },
    { key: "openPieces", href: "/orders", icon: Package },
  ]},
  { title: "nav.production", cards: [
    { key: "producedToday", href: "/production", icon: Factory },
    { key: "productsToday", href: "/production", icon: CalendarDays },
    { key: "producedWeek", href: "/reports/production", icon: Factory },
    { key: "machinesDown", href: "/assets?status=down", icon: AlertOctagon, alert: true },
    { key: "openMaintenance", href: "/service", icon: Wrench },
  ]},
  { title: "nav.qc", cards: [
    { key: "notInspected", href: "/qc", icon: SearchCheck },
    { key: "rejectedWeek", href: "/reports/quality", icon: ShieldX, alert: true },
    { key: "openIssues", href: "/qc?tab=issues", icon: ShieldQuestion },
    { key: "criticalIssues", href: "/qc?tab=issues&severity=CRITICAL", icon: ShieldAlert, alert: true },
  ]},
  { title: "nav.inventory", cards: [
    { key: "stock", href: "/inventory", icon: Boxes },
    { key: "outWeek", href: "/inventory?tab=movements", icon: PackageMinus },
  ]},
];

export default async function DashboardPage() {
  const me = await pageUser("orders:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { cards, activity } = await getDashboard();
  const safe = can(me, "cash:view") ? await balances() : null;

  return (
    <>
      <PageHeader
        title={t("dashboard.greeting", { name: me.fullName.split(" ")[0] })}
        subtitle={`${t("app.company")} · ${t("dashboard.updated", { time: formatDateTime(new Date(), locale) })}`}
      />
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-muted">{t(g.title)}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {g.cards.map((c) => {
                const value = cards[c.key as keyof typeof cards];
                const warn = c.alert && value > 0;
                return (
                  <Link
                    key={c.key}
                    href={c.href}
                    className={cn(
                      "group rounded-2xl border bg-surface p-4 transition hover:border-brand-300 hover:shadow-sm",
                      warn ? "border-red-300 dark:border-red-900" : "border-line",
                    )}
                  >
                    <c.icon className={cn("size-5", warn ? "text-red-600" : "text-brand-500")} aria-hidden />
                    <p className={cn("mt-3 text-2xl font-bold tabular-nums", warn && "text-red-600")}>{formatNumber(value, locale)}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted">{t(`dashboard.${c.key}`)}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {safe && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">{t("nav.cash")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(["IQD", "USD", "EUR"] as const).map((c) => (
                <Link key={c} href="/cash" className="rounded-2xl border border-line bg-surface p-4 transition hover:border-brand-300 hover:shadow-sm">
                  <Vault className="size-5 text-brand-500" aria-hidden />
                  <p className="mt-3 text-2xl font-bold tabular-nums" dir="ltr">{safe[c].toLocaleString("en", { maximumFractionDigits: 2 })}</p>
                  <p className="mt-0.5 text-xs text-muted">{t(`cash.cur.${c}`)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">{t("dashboard.recentActivity")}</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">{t("dashboard.noActivity")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <span>
                    <b>{a.user?.fullName ?? "System"}</b> <span className="text-muted">·</span>{" "}
                    <span className="text-muted">{t.has(`history.${a.action}`) ? t(`history.${a.action}`) : a.action}</span>
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(a.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
