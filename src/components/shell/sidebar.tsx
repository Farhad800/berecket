"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeftRight, Vault, Printer, Contact, BarChart3, Bell, Building2, CalendarRange, ClipboardList, Cog, Factory, History, KeyRound,
  LayoutDashboard, Menu, Package, ScrollText, ShieldCheck, Truck, Users, Warehouse, Wrench, X, type LucideIcon,
} from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/components/ui";

const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight, Vault, Printer, Contact, BarChart3, Bell, Building2, CalendarRange, ClipboardList, Cog, Factory, History, KeyRound,
  LayoutDashboard, Package, ScrollText, ShieldCheck, Truck, Users, Warehouse, Wrench,
};

function NavList({ groups, unread, onNavigate }: { groups: NavGroup[]; unread: number; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav className="space-y-5 px-3 py-4">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-brand-200 uppercase">{t(g.key)}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = path === item.href || path.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                      active ? "bg-white text-brand-700 shadow-sm" : "text-brand-50 hover:bg-white/10",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{t(item.key)}</span>
                    {item.key === "notifications" && unread > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-brand-900">{unread > 99 ? "99+" : unread}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  const t = useTranslations("app");
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/bereket-logo.jpg" alt="Bereket Plastic" width={56} height={53} className="rounded-lg" />
      <span className="leading-tight">
        <span className="block font-bold text-white">{t("company")}</span>
        <span className="block text-xs text-brand-200">{t("system")}</span>
      </span>
    </Link>
  );
}

export default function Sidebar({ groups, unread }: { groups: NavGroup[]; unread: number }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <>
      {/* Desktop */}
      <aside className="logo-tile sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto lg:flex">
        <Brand />
        <NavList groups={groups} unread={unread} />
      </aside>

      {/* Mobile trigger lives in the top bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-[calc(10px+env(safe-area-inset-top))] z-40 inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface-2 start-2 lg:hidden"
        aria-label={t("menu")}
        aria-expanded={open}
      >
        <Menu className="size-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label={t("close")} onClick={() => setOpen(false)} />
          <aside className="logo-tile absolute inset-y-0 start-0 flex w-[82%] max-w-xs flex-col overflow-y-auto pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-between pe-2">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-lg p-2 text-white hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            <NavList groups={groups} unread={unread} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
