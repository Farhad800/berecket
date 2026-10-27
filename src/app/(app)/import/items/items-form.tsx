"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileCheck2, Upload } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { importItemsAction } from "@/app/actions/items-import";
import type { ItemsPlan, SheetId } from "@/lib/items-workbook";

type Res = Awaited<ReturnType<typeof importItemsAction>>;
const SHEETS: SheetId[] = ["STICKER", "MATERIAL", "PACKAGING", "PRODUCT", "RECIPE"];

/** Upload the filled items workbook: check first (what will change, mistakes by row), then save. */
export default function ItemsImportForm() {
  const t = useTranslations();
  const ref = useRef<HTMLFormElement>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();
  const send = (mode: "check" | "save") => {
    const fd = new FormData(ref.current!);
    fd.set("mode", mode);
    start(async () => setRes(await importItemsAction(null, fd)));
  };
  const plan = res?.ok ? (res.data as ItemsPlan & { saved: boolean }) : null;
  const total = plan ? SHEETS.reduce((s, k) => s + plan.counts[k].create + plan.counts[k].update, 0) + plan.stockUp + plan.stockDown : 0;
  const sheet = (k: SheetId) => t(`iw.sheet.${k}`);

  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); send("check"); }} className="space-y-4">
      <h2 className="font-semibold">{t("iw.step2")}</h2>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2 p-4 text-center text-sm hover:border-brand-400">
        <Upload className="size-6 text-muted" />
        <span className="font-semibold">{fileName || t("iw.choose")}</span>
        <span className="text-xs text-muted">.xlsx · max 8 MB</span>
        <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label={t("iw.choose")}
          onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? ""); setRes(null); }} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending || !fileName}><FileCheck2 className="size-4" /> {pending ? t("imp.reading") : t("imp.check")}</Button>

      {res && !res.ok && <div data-testid="iw-error"><Alert>{res.error}</Alert></div>}
      {plan && (
        <div className="space-y-3">
          <div className="table-wrap overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm" data-testid="iw-plan">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr><th className="px-3 py-2 text-start" /><th className="px-3 py-2 text-end">{t("imp.new")}</th><th className="px-3 py-2 text-end">{t("imp.updated")}</th><th className="px-3 py-2 text-end">{t("imp.unchanged")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SHEETS.map((k) => (
                  <tr key={k}>
                    <td className="px-3 py-2 font-medium">{sheet(k)}</td>
                    <td className="px-3 py-2 text-end font-bold tabular-nums">{plan.counts[k].create.toLocaleString("en")}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{plan.counts[k].update.toLocaleString("en")}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-muted">{plan.counts[k].same.toLocaleString("en")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1 text-sm" data-testid="iw-extra">
            <li>{t("iw.costs", { n: plan.costs.toLocaleString("en") })}</li>
            <li>{t("iw.stock", { up: plan.stockUp.toLocaleString("en"), down: plan.stockDown.toLocaleString("en") })}</li>
          </ul>
          {plan.errors.length > 0 ? (
            <>
              <Alert>{t("imp.hasErrors", { n: plan.errors.length })}</Alert>
              <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-red-200 text-sm dark:border-red-900" data-testid="iw-errors">
                {plan.errors.map((e, i) => (
                  <li key={i} className="px-3 py-1.5"><span className="font-semibold">{sheet(e.sheet)} · {t("imp.row", { n: e.row })}:</span> {e.message}</li>
                ))}
              </ul>
            </>
          ) : plan.saved ? (
            <div data-testid="iw-done"><Alert tone="green">
              {t("iw.done")}{plan.docs?.input && <> · <b dir="ltr">{plan.docs.input}</b></>}{plan.docs?.output && <> · <b dir="ltr">{plan.docs.output}</b></>}{" "}
              <Link href="/inventory" className="font-semibold underline">{t("nav.inventory")}</Link>
            </Alert></div>
          ) : total === 0 ? (
            <Alert tone="blue">{t("imp.nothing")}</Alert>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Alert tone="green">{t("imp.ready")}</Alert>
              <Button type="button" onClick={() => send("save")} disabled={pending}><Upload className="size-4" /> {pending ? t("common.saving") : t("iw.save")}</Button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
