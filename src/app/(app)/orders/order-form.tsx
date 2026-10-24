"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Save, Search, X } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, cn } from "@/components/ui";
import { createOrderAction, updateOrderAction } from "@/app/actions/orders";
import MoldSelect, { moldMatch, newGroup } from "@/components/mold-select";

type Product = { id: string; code: string; name: string; name2?: string | null; mold?: string | null };

/**
 * The order sheet: every product with an amount box. The Sales Manager types the amounts
 * needed; products left empty are not part of the order.
 */
export default function OrderForm({ products, initial }: { products: Product[]; initial?: { id: string; quantities: Record<string, number> } }) {
  const t = useTranslations();
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial?.quantities ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [filter, setFilter] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [mold, setMold] = useState("");
  const { onSubmit, pending, error } = useFormAction(initial ? updateOrderAction : createOrderAction);

  const chosen = products.filter((p) => Number(qty[p.id]) > 0);
  const pieces = chosen.reduce((s, p) => s + Number(qty[p.id]), 0);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return products.filter((p) => (!onlyChosen || Number(qty[p.id]) > 0) && moldMatch(p.mold, mold) && (!q || `${p.code} ${p.name} ${p.name2 ?? ""} ${p.mold ?? ""}`.toLowerCase().includes(q)));
  }, [products, filter, onlyChosen, qty, mold]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-q]"));
    all[all.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <form onSubmit={onSubmit} className="pb-24">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {chosen.map((p) => (
        <span key={p.id} hidden>
          <input type="hidden" name="productId[]" value={p.id} />
          <input type="hidden" name="quantity[]" value={qty[p.id]} />
        </span>
      ))}
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("order.filterProducts")} aria-label={t("order.filterProducts")} className="min-h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-sm" />
        </label>
        <MoldSelect rows={products} value={mold} onChange={setMold} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyChosen} onChange={(e) => setOnlyChosen(e.target.checked)} className="size-5 accent-brand-600" /> {t("order.onlyChosen")}
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-[1fr_9rem] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted">
          <span>{t("order.product")}</span><span className="text-end">{t("order.quantity")} ({t("md.pcs")})</span>
        </div>
        <ul className="divide-y divide-line">
          {shown.map((p, i) => (
            <li key={p.id} className={cn("grid grid-cols-[1fr_9rem] items-center gap-3 px-4 py-2", Number(qty[p.id]) > 0 && "bg-brand-50/60 dark:bg-brand-900/30")}>
              {p.mold && newGroup(shown, i) && <p className="col-span-2 -mx-4 -mt-2 mb-1 bg-surface-2 px-4 py-1 text-xs font-bold text-muted" dir="ltr">{p.mold}</p>}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted" dir="ltr">{p.name2 ? `${p.name2} · ` : ""}{p.code}</p>
              </div>
              <div className="flex items-center gap-1">
                <input
                  data-q
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={qty[p.id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
                  onKeyDown={onKey}
                  aria-label={`${p.code} ${t("order.quantity")}`}
                  className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-end text-base tabular-nums"
                  dir="ltr"
                />
                {qty[p.id] && (
                  <button type="button" aria-label={t("order.removeLine")} onClick={() => setQty((q) => ({ ...q, [p.id]: "" }))} className="rounded-md p-1.5 text-muted hover:text-red-600">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("common.empty")}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:start-64" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm">{t("order.sheetSummary", { n: chosen.length, pcs: pieces.toLocaleString("en") })}</p>
          <Button type="submit" disabled={pending || chosen.length === 0}>
            <Save className="size-4" /> {pending ? t("common.saving") : initial ? t("common.save") : t("order.saveOrder")}
          </Button>
        </div>
      </div>
    </form>
  );
}
