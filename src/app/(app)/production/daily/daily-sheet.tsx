"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Save, Search } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Badge, Button, cn } from "@/components/ui";
import { saveDailySheetAction, type SheetResult } from "@/app/actions/production";

export type SheetRow = {
  id: string; job: string; status: string; machine: string; machineDown: boolean; product: string; order: string;
  planned: number; produced: number; today: number; batch: string | null;
};

const nf = (n: number) => n.toLocaleString("en");

export default function DailySheet({ rows, shift, canEnter, canStart }: { rows: SheetRow[]; shift: "A" | "B" | "C"; canEnter: boolean; canStart: boolean }) {
  const t = useTranslations();
  const [filter, setFilter] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, error, state } = useFormAction(saveDailySheetAction, {
    onSuccess: (res) => {
      const saved = new Set(res.ok ? (res.data as SheetResult).savedIds : []);
      setVals((v) => Object.fromEntries(Object.entries(v).filter(([k]) => !saved.has(k.split("_")[1]))));
    },
  });
  const result = state?.ok ? (state.data as SheetResult) : null;

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.job} ${r.machine} ${r.product} ${r.order}`.toLowerCase().includes(q)) : rows;
  }, [rows, filter]);
  const filled = Object.entries(vals).filter(([k, v]) => (k.startsWith("done_") ? v === "on" : v !== "" && Number(v) > 0));
  const jobsFilled = new Set(filled.map(([k]) => k.split("_")[1])).size;
  const piecesFilled = filled.filter(([k]) => k.startsWith("good_")).reduce((s, [, v]) => s + Number(v), 0);

  // Enter jumps to the next quantity box, like a spreadsheet.
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>("input[data-q]") ?? []);
    inputs[inputs.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="pb-24">
      <div className="mb-3 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("daily.filter")} aria-label={t("daily.filter")} className="min-h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-sm" />
        </label>
        <label className="text-xs font-semibold text-muted">
          {t("daily.shift")}
          <select name="shift" defaultValue={shift} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink">
            {(["A", "B", "C"] as const).map((s) => <option key={s} value={s}>{t(`rep.shift.${s}`)}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="newBatch" className="size-5 accent-brand-600" /> {t("daily.newBatch")}
        </label>
      </div>

      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {result && (
        <div className="mb-3 space-y-2">
          <Alert tone="green">{t("daily.saved", { n: result.saved, pcs: nf(result.pieces) })}{result.started > 0 && ` ${t("daily.started", { n: result.started })}`}{result.completed > 0 && ` ${t("daily.completed", { n: result.completed })}`}</Alert>
          {result.failed.length > 0 && (
            <Alert>
              <b>{t("daily.notSaved", { n: result.failed.length })}</b>
              <ul className="mt-1 list-disc ps-5">{result.failed.map((f) => <li key={f.job}><span dir="ltr">{f.job}</span>: {f.error}</li>)}</ul>
            </Alert>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_7rem_7rem_5rem] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted md:grid">
          <span>{t("daily.colJob")}</span><span className="text-end">{t("daily.colProgress")}</span><span className="text-end">{t("prod.good")}</span><span className="text-end">{t("prod.defective")}</span><span className="text-center">{t("daily.finished")}</span>
        </div>
        <ul className="divide-y divide-line">
          {shown.map((r) => {
            const blocked = r.status === "PLANNED" && (!canStart || r.machineDown);
            const disabled = !canEnter || blocked;
            return (
              <li key={r.id} className={cn("grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_7rem_7rem_5rem] md:items-center", (vals[`good_${r.id}`] || vals[`bad_${r.id}`] || vals[`done_${r.id}`]) && "bg-brand-50/60 dark:bg-brand-900/30")}>
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-bold" dir="ltr">{r.machine}</span>
                    <Link href={`/production/${r.id}`} className="font-semibold text-brand-600 hover:underline dark:text-brand-300" dir="ltr">{r.job}</Link>
                    {r.status !== "IN_PROGRESS" && <Badge tone={r.status === "PAUSED" ? "amber" : "blue"}>{t(`status.job.${r.status}`)}</Badge>}
                    {r.machineDown && <Badge tone="red">{t("daily.machineDown")}</Badge>}
                  </div>
                  <p className="truncate text-sm">{r.product}</p>
                  <p className="truncate text-xs text-muted">{r.order}{r.batch && <> · <span dir="ltr">{r.batch}</span></>}</p>
                </div>
                <div className="col-span-2 text-xs text-muted md:col-span-1 md:text-end">
                  <span className="font-semibold text-ink tabular-nums">{nf(r.produced)}</span> / {nf(r.planned)}
                  {r.today > 0 && <span className="block">{t("daily.todaySoFar", { n: nf(r.today) })}</span>}
                  {r.status === "PLANNED" && !blocked && <span className="block text-brand-600 dark:text-brand-300">{t("daily.willStart")}</span>}
                </div>
                {(["good", "bad"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-[11px] text-muted md:hidden">{k === "good" ? t("prod.good") : t("prod.defective")}</span>
                    <input
                      data-q
                      name={`${k}_${r.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      disabled={disabled}
                      value={vals[`${k}_${r.id}`] ?? ""}
                      onChange={(e) => setVals((v) => ({ ...v, [`${k}_${r.id}`]: e.target.value }))}
                      onKeyDown={onKey}
                      aria-label={`${r.job} ${k === "good" ? t("prod.good") : t("prod.defective")}`}
                      className={cn("min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-end text-base tabular-nums disabled:opacity-50", k === "bad" && "text-amber-700 dark:text-amber-400")}
                      dir="ltr"
                    />
                  </label>
                ))}
                <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm md:col-span-1 md:justify-center">
                  <input
                    type="checkbox"
                    name={`done_${r.id}`}
                    disabled={!canStart || disabled}
                    checked={vals[`done_${r.id}`] === "on"}
                    onChange={(e) => setVals((v) => ({ ...v, [`done_${r.id}`]: e.target.checked ? "on" : "" }))}
                    className="size-5 accent-brand-600"
                    aria-label={`${r.job} ${t("daily.finished")}`}
                  />
                  <span className="md:hidden">{t("daily.finished")}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("common.empty")}</p>}
      </div>

      {canEnter && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:start-64" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <p className="text-sm">{t("daily.summary", { jobs: jobsFilled, pcs: nf(piecesFilled) })}</p>
            <Button type="submit" disabled={pending || jobsFilled === 0}><Save className="size-4" /> {pending ? t("common.saving") : t("daily.saveAll")}</Button>
          </div>
        </div>
      )}
    </form>
  );
}
