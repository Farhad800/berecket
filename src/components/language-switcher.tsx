"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocaleAction } from "@/app/actions/auth";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { cn } from "./ui";

export default function LanguageSwitcher({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex items-center gap-1", pending && "opacity-60", className)} aria-label="Language">
      <Globe className={cn("size-4", tone === "dark" ? "text-brand-100" : "text-muted")} aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => start(async () => { await setLocaleAction(l); router.refresh(); })}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-semibold",
            tone === "dark"
              ? l === locale ? "bg-white/20 text-white" : "text-brand-100 hover:bg-white/10"
              : l === locale ? "bg-brand-600 text-white" : "text-muted hover:bg-surface-2",
          )}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
