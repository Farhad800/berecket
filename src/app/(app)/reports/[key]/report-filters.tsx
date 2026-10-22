"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/components/ui";
import type { SelectDef } from "@/lib/reports/context";

// Date maths on plain "YYYY-MM-DD" strings (the factory calendar), done in UTC so the
// browser's own time zone can't shift the day.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const s = (x: Date) => x.toISOString().slice(0, 10);
const addDays = (str: string, n: number) => s(new Date(d(str).getTime() + n * 86_400_000));
function presets(today: string) {
  const t = d(today);
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  return {
    today: [today, today],
    last7: [addDays(today, -6), today],
    last30: [addDays(today, -29), today],
    thisMonth: [s(new Date(Date.UTC(y, m, 1))), today],
    lastMonth: [s(new Date(Date.UTC(y, m - 1, 1))), s(new Date(Date.UTC(y, m, 0)))],
    thisYear: [s(new Date(Date.UTC(y, 0, 1))), today],
  } as const;
}

export default function ReportFilters({ range, from, to, today, selects }: { range: boolean; from: string; to: string; today: string; selects: SelectDef[] }) {
  const t = useTranslations("rep.f");
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const hrefWith = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    return `${path}?${next.toString()}`;
  };
  const go = (changes: Record<string, string>) => start(() => router.replace(hrefWith(changes), { scroll: false }));
  const p = presets(today);
  const active = (Object.keys(p) as (keyof typeof p)[]).find((k) => p[k][0] === from && p[k][1] === to);

  return (
    <div className={cn("mb-4 space-y-3 rounded-2xl border border-line bg-surface p-3 sm:p-4", pending && "opacity-70")} aria-busy={pending}>
      {range && (
        <div className="space-y-2">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {(Object.keys(p) as (keyof typeof p)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => go({ from: p[k][0], to: p[k][1] })}
                aria-pressed={active === k}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold",
                  active === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                {t(`preset.${k}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-muted">
              {t("from")}
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && go({ from: e.target.value })} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink" dir="ltr" />
            </label>
            <label className="text-xs font-semibold text-muted">
              {t("to")}
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && go({ to: e.target.value })} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink" dir="ltr" />
            </label>
            {pending && <Loader2 className="mb-3 size-4 animate-spin text-muted" aria-label="…" />}
          </div>
        </div>
      )}
      {selects.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {selects.map((f) => (
            <label key={f.name} className="text-xs font-semibold text-muted">
              {f.label}
              <select
                value={f.value}
                onChange={(e) => go({ [f.name]: e.target.value })}
                className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
              >
                {f.allLabel && <option value="">{f.allLabel}</option>}
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {[...params.keys()].length > 0 && (
        <button type="button" onClick={() => start(() => router.replace(path, { scroll: false }))} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          <RotateCcw className="size-3.5" /> {t("reset")}
        </button>
      )}
    </div>
  );
}
