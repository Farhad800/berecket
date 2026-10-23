"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PackageMinus, Search } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Input, cn } from "@/components/ui";
import { stockOutAction, type OutResult } from "@/app/actions/warehouse";
import MoldSelect, { moldMatch, newGroup } from "@/components/mold-select";

type Row = { id: string; code: string; name: string; mold: string | null; stock: number };
const nf = (n: number) => n.toLocaleString("en");

/** Stock per product; warehouse staff can type pieces going out for many products at once. */
export default function StockOut({ rows, canOut }: { rows: Row[]; canOut: boolean }) {
  const t = useTranslations();
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [mold, setMold] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const { onSubmit, pending, error, state } = useFormAction(stockOutAction, { onSuccess: () => setVals({}), resetOnSuccess: true });
  const result = state?.ok ? (state.data as OutResult) : null;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => (showAll || r.stock !== 0 || Number(vals[r.id]) > 0) && moldMatch(r.mold, mold) && (!q || `${r.code} ${r.name} ${r.mold ?? ""}`.toLowerCase().includes(q)));
  }, [rows, filter, showAll, vals, mold]);
  const filled = Object.entries(vals).filter(([, v]) => Number(v) > 0);
  const pieces = filled.reduce((s, [, v]) => s + Number(v), 0);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("order.filterProducts")} aria-label={t("order.filterProducts")} className="min-h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-sm" />
        </label>
        <MoldSelect rows={rows} value={mold} onChange={setMold} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-5 accent-brand-600" /> {t("wh.showEmpty")}
        </label>
      </div>
      {error && <Alert>{error}</Alert>}
      {result && <Alert tone="green">{t("wh.outSaved", { n: result.lines, pcs: nf(result.pieces) })}</Alert>}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className={cn("grid gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted", canOut ? "grid-cols-[1fr_7rem_8rem]" : "grid-cols-[1fr_7rem]")}>
          <span>{t("order.product")}</span><span className="text-end">{t("order.inStock")}</span>{canOut && <span className="text-end">{t("wh.goingOut")}</span>}
        </div>
        <ul className="divide-y divide-line">
          {shown.map((r, i) => (
            <li key={r.id} className={cn("grid items-center gap-3 px-4 py-2", canOut ? "grid-cols-[1fr_7rem_8rem]" : "grid-cols-[1fr_7rem]", Number(vals[r.id]) > 0 && "bg-brand-50/60 dark:bg-brand-900/30")}>
              {r.mold && newGroup(shown, i) && <p className="col-span-full -mx-4 -mt-2 mb-1 bg-surface-2 px-4 py-1 text-xs font-bold text-muted" dir="ltr">{r.mold}</p>}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted" dir="ltr">{r.code}</p>
              </div>
              <span className={cn("text-end text-base font-bold tabular-nums", r.stock === 0 && "font-normal text-muted")}>{nf(r.stock)}</span>
              {canOut && (
                <input
                  name={`out_${r.id}`} type="number" inputMode="numeric" min={0} max={Math.max(r.stock, 0)} step={1} disabled={r.stock <= 0}
                  value={vals[r.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [r.id]: e.target.value }))}
                  aria-label={`${r.code} ${t("wh.goingOut")}`} dir="ltr"
                  className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-end text-base tabular-nums disabled:opacity-40"
                />
              )}
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("wh.noStock")}</p>}
      </div>
      {canOut && filled.length > 0 && (
        <div className="grid gap-2 rounded-2xl border border-brand-200 bg-brand-50/50 p-3 sm:grid-cols-[1fr_auto] sm:items-end dark:border-brand-800 dark:bg-brand-900/30">
          <label className="text-xs font-semibold text-muted">{t("wh.reference")}
            <Input name="reference" placeholder={t("wh.referenceHint")} className="mt-1" />
          </label>
          <Button type="submit" disabled={pending}><PackageMinus className="size-4" /> {t("wh.saveOut", { n: filled.length, pcs: nf(pieces) })}</Button>
        </div>
      )}
    </form>
  );
}
