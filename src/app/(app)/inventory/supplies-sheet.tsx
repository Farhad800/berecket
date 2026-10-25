"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PackageMinus, PackagePlus, Search } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Input, cn } from "@/components/ui";
import { stockSuppliesAction, type SupplyResult } from "@/app/actions/warehouse";

type Row = { id: string; code: string; name: string; name2: string | null; unit: string; stock: number };
const fmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });

/** Stickers or materials: one sheet to record what came in (received) or went to production (used). */
export default function SuppliesSheet({ rows, kind, canEdit }: { rows: Row[]; kind: "STICKER" | "MATERIAL" | "PACKAGING"; canEdit: boolean }) {
  const t = useTranslations();
  const [mode, setMode] = useState<"RECEIVE" | "USE">("RECEIVE");
  const [filter, setFilter] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const { onSubmit, pending, error, state } = useFormAction(stockSuppliesAction, { onSuccess: () => setVals({}), resetOnSuccess: true });
  const result = state?.ok ? (state.data as SupplyResult) : null;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => (!onlyStock || r.stock !== 0 || Number(vals[r.id]) > 0) && (!q || `${r.code} ${r.name} ${r.name2 ?? ""}`.toLowerCase().includes(q)));
  }, [rows, filter, onlyStock, vals]);
  const filled = Object.entries(vals).filter(([, v]) => Number(v) > 0);
  const cols = canEdit ? "grid-cols-[1fr_7rem_8rem]" : "grid-cols-[1fr_7rem]";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="mode" value={mode} />
      {canEdit && (
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist">
          {(["RECEIVE", "USE"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setVals({}); }}
              className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", mode === m ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
              {m === "RECEIVE" ? <PackagePlus className="size-4" /> : <PackageMinus className="size-4" />} {t(m === "RECEIVE" ? "wh.receiveMode" : "wh.useMode")}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("wh.filterItems")} aria-label={t("wh.filterItems")} className="min-h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-sm" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} className="size-5 accent-brand-600" /> {t("wh.onlyInStock")}
        </label>
      </div>
      {error && <Alert>{error}</Alert>}
      {result && <Alert tone="green">{t(result.mode === "RECEIVE" ? "wh.receivedSaved" : "wh.usedSaved", { n: result.lines })}</Alert>}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className={cn("grid gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted", cols)}>
          <span>{t("wh.item")}</span><span className="text-end">{t("order.inStock")}</span>
          {canEdit && <span className="text-end">{t(mode === "RECEIVE" ? "wh.received" : "wh.used")}</span>}
        </div>
        <ul className="divide-y divide-line">
          {shown.map((r) => {
            const kg = r.unit.toLowerCase() === "kg";
            return (
              <li key={r.id} className={cn("grid items-center gap-3 px-4 py-2", cols, Number(vals[r.id]) > 0 && "bg-brand-50/60 dark:bg-brand-900/30")}>
                <div className="min-w-0">
                  <Link href={`/products/${r.id}`} className="block truncate text-sm font-medium hover:underline">{r.name}</Link>
                  <p className="truncate text-xs text-muted">{r.name2 && <span dir="ltr">{r.name2} · </span>}<span dir="ltr">{r.code}</span></p>
                </div>
                <span className={cn("text-end text-base font-bold tabular-nums", r.stock === 0 && "font-normal text-muted", r.stock < 0 && "text-red-600")} dir="ltr">{fmt(r.stock)} <span className="text-xs font-normal text-muted">{kg ? "kg" : t("md.pcs")}</span></span>
                {canEdit && (
                  <input
                    name={`q_${r.id}`} type="number" inputMode="decimal" min={0} step={kg ? "0.001" : 1} max={mode === "USE" ? Math.max(r.stock, 0) : undefined}
                    disabled={mode === "USE" && r.stock <= 0} value={vals[r.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [r.id]: e.target.value }))}
                    aria-label={`${r.code} ${t(mode === "RECEIVE" ? "wh.received" : "wh.used")}`} dir="ltr"
                    className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-end text-base tabular-nums disabled:opacity-40"
                  />
                )}
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("wh.noStock")}</p>}
      </div>
      {canEdit && filled.length > 0 && (
        <div className="grid gap-2 rounded-2xl border border-brand-200 bg-brand-50/50 p-3 sm:grid-cols-[1fr_auto] sm:items-end dark:border-brand-800 dark:bg-brand-900/30">
          <label className="text-xs font-semibold text-muted">{t("wh.reference")}
            <Input name="reference" placeholder={t(mode === "RECEIVE" ? "wh.receiveRefHint" : "wh.useRefHint")} className="mt-1" />
          </label>
          <Button type="submit" disabled={pending}>
            {mode === "RECEIVE" ? <PackagePlus className="size-4" /> : <PackageMinus className="size-4" />} {t(mode === "RECEIVE" ? "wh.saveReceive" : "wh.saveUse", { n: filled.length })}
          </Button>
        </div>
      )}
    </form>
  );
}
