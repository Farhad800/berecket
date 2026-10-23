"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import LanguageSwitcher from "@/components/language-switcher";
import { removePushSubscriptionAction } from "@/app/actions/push";
import { getEndpoint } from "@/components/push/client";

export default function UserMenu({ name, role }: { name: string; role: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-surface-2"
      >
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials}</span>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted">{role}</span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div className="absolute end-0 z-40 mt-1 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="border-b border-line px-2 pb-2 sm:hidden">
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs text-muted">{role}</p>
          </div>
          <div className="px-2 py-2">
            <p className="mb-1 text-xs text-muted">{t("common.language")}</p>
            <LanguageSwitcher />
          </div>
          <Link href="/change-password" className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-surface-2">
            <KeyRound className="size-4" /> {t("auth.changePassword")}
          </Link>
          <form
            action={async () => {
              // A signed-out phone must stop getting this employee's notifications.
              const ep = await getEndpoint().catch(() => null);
              if (ep) await removePushSubscriptionAction(ep).catch(() => {});
              await logoutAction();
            }}
          >
            <button className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm text-red-600 hover:bg-surface-2">
              <LogOut className="size-4" /> {t("common.signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
