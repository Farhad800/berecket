"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Save, Search } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, cn } from "@/components/ui";
import { saveDailyEntriesAction, type SheetResult } from "@/app/actions/production";
import MoldSelect, { moldMatch, newGroup } from "@/components/mold-select";

type Shift = "A" | "B" | "C";
export type SheetRow = { id: string; code: string; name: string; name2: string | null; mold: string | null; ordered: number; stock: number; entered: Record<Shift, number> };
const nf = (n: number) => n.toLocaleString("en");

export default function DailySheet({ rows, day, today, shift }: { rows: SheetRow[]; day: string; today: string; shift: Shift }) {
  const t = useTranslations();
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [onlyOrdered, setOnlyOrdered] = useState(rows.some((r) => r.ordered > 0));
  const [mold, setMold] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, error, state } = useFormAction(saveDailyEntriesAction, { once: true, onSuccess: () => setVals({}) });
  const result = state?.ok ? (state.data as SheetResult) : null;

  // Changing the day or shift reloads the sheet so "already entered" figures match.
  const go = (d: string, s: string) => router.replace(`/production/daily?day=${d}&shift=${s}`, { scroll: false });

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => (!onlyOrdered || r.ordered > 0 || Number(vals[r.id]) > 0) && moldMatch(r.mold, mold) && (!q || `${r.code} ${r.name} ${r.name2 ?? ""} ${r.mold ?? ""}`.toLowerCase().includes(q)));
  }, [rows, filter, onlyOrdered, vals, mold]);
  const filled = Object.entries(vals).filter(([, v]) => Number(v) > 0);
  const pieces = filled.reduce((s, [, v]) => s + Number(v), 0);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>("input[data-q]") ?? []);
    inputs[inputs.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="pb-24">
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="shift" value={shift} />
      <div className="mb-3 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[auto_auto_1fr_auto_auto] sm:items-end">
        <label className="text-xs font-semibold text-muted">
          {t("prod.day")}
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && go(e.target.value, shift)} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink" dir="ltr" />
        </label>
        <label className="text-xs font-semibold text-muted">
          {t("daily.shift")}
          <select value={shift} onChange={(e) => go(day, e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink">
            {(["A", "B", "C"] as const).map((s) => <option key={s} value={s}>{t(`rep.shift.${s}`)}</option>)}
          </select>
        </label>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("order.filterProducts")} aria-label={t("order.filterProducts")} className="min-h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-sm" />
        </label>
        <MoldSelect rows={rows} value={mold} onChange={setMold} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyOrdered} onChange={(e) => setOnlyOrdered(e.target.checked)} className="size-5 accent-brand-600" /> {t("daily.onlyOrdered")}
        </label>
      </div>

      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {result && <div className="mb-3"><Alert tone="green">{t("daily.saved", { n: result.products, pcs: nf(result.pieces) })}</Alert></div>}
      {result && result.shortages.length > 0 && (
        <div className="mb-3"><Alert tone="amber">{t("daily.shortage", { items: result.shortages.map((x) => `${x.code} (${x.stock.toLocaleString("en", { maximumFractionDigits: 3 })} ${x.unit})`).join(", ") })}</Alert></div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_9rem] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted md:grid">
          <span>{t("order.product")}</span>
          <span className="text-end">{t("daily.inOrders")}</span>
          <span className="text-end">{t("order.inStock")}</span>
          <span className="text-end">{t("daily.alreadyShift", { shift })}</span>
          <span className="text-end">{t("daily.produced")}</span>
        </div>
        <ul className="divide-y divide-line">
          {shown.map((r, i) => (
            <li key={r.id} className={cn("grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-3 gap-y-1 px-4 py-2 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_9rem]", Number(vals[r.id]) > 0 && "bg-brand-50/60 dark:bg-brand-900/30")}>
              {r.mold && newGroup(shown, i) && <p className="col-span-full -mx-4 -mt-2 mb-1 bg-surface-2 px-4 py-1 text-xs font-bold text-muted" dir="ltr">{r.mold}</p>}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  <span dir="ltr">{r.name2 ? `${r.name2} · ` : ""}{r.code}</span>
                  <span className="md:hidden"> · {t("daily.inOrders")}: {nf(r.ordered)} · {t("order.inStock")}: {nf(r.stock)}{r.entered[shift] > 0 && ` · ${t("daily.alreadyShift", { shift })}: ${nf(r.entered[shift])}`}</span>
                </p>
              </div>
              <span className="hidden text-end text-sm tabular-nums md:block">{r.ordered ? nf(r.ordered) : "—"}</span>
              <span className="hidden text-end text-sm tabular-nums md:block">{nf(r.stock)}</span>
              <span className={cn("hidden text-end text-sm tabular-nums md:block", r.entered[shift] > 0 ? "font-semibold" : "text-muted")}>{r.entered[shift] ? nf(r.entered[shift]) : "—"}</span>
              <input
                data-q
                name={`qty_${r.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={vals[r.id] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [r.id]: e.target.value }))}
                onKeyDown={onKey}
                aria-label={`${r.code} ${t("daily.produced")}`}
                className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-end text-base tabular-nums"
                dir="ltr"
              />
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">{onlyOrdered ? t("daily.noOrdered") : t("common.empty")}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:start-64" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm">{t("daily.summary", { n: filled.length, pcs: nf(pieces), shift })}</p>
          <Button type="submit" disabled={pending || filled.length === 0}><Save className="size-4" /> {pending ? t("common.saving") : t("daily.saveAll")}</Button>
        </div>
      </div>
    </form>
  );
}
