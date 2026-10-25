"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileCheck2, Upload } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { importMasterDataAction } from "@/app/actions/import";
import type { Plan, SheetKey } from "@/lib/import";

type Res = Awaited<ReturnType<typeof importMasterDataAction>>;
const SHEETS: SheetKey[] = ["machines", "molds", "products", "recipes"];

export default function ImportForm() {
  const t = useTranslations();
  const ref = useRef<HTMLFormElement>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();
  const send = (mode: "check" | "save") => {
    const fd = new FormData(ref.current!);
    fd.set("mode", mode);
    start(async () => setRes(await importMasterDataAction(null, fd)));
  };
  const plan = res?.ok ? (res.data as Plan & { saved: boolean }) : null;
  const total = plan ? SHEETS.reduce((s, k) => s + plan.counts[k].create + plan.counts[k].update, 0) : 0;

  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); send("check"); }} className="space-y-4">
      <h2 className="font-semibold">{t("imp.step2")}</h2>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2 p-4 text-center text-sm hover:border-brand-400">
        <Upload className="size-6 text-muted" />
        <span className="font-semibold">{fileName || t("imp.choose")}</span>
        <span className="text-xs text-muted">.xlsx · .csv · max 5 MB</span>
        <input name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
          onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? ""); setRes(null); }} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending || !fileName}><FileCheck2 className="size-4" /> {pending ? t("imp.reading") : t("imp.check")}</Button>

      {res && !res.ok && <Alert>{res.error}</Alert>}
      {plan && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr><th className="px-3 py-2 text-start" /><th className="px-3 py-2 text-end">{t("imp.new")}</th><th className="px-3 py-2 text-end">{t("imp.updated")}</th><th className="px-3 py-2 text-end">{t("imp.unchanged")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SHEETS.map((k) => (
                  <tr key={k}>
                    <td className="px-3 py-2 font-medium">{t(`imp.sheet.${k}`)}</td>
                    <td className="px-3 py-2 text-end font-bold tabular-nums">{plan.counts[k].create.toLocaleString("en")}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{plan.counts[k].update.toLocaleString("en")}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-muted">{plan.counts[k].same.toLocaleString("en")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.errors.length > 0 ? (
            <>
              <Alert>{t("imp.hasErrors", { n: plan.errors.length })}</Alert>
              <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-red-200 text-sm dark:border-red-900">
                {plan.errors.map((e, i) => (
                  <li key={i} className="px-3 py-1.5"><span className="font-semibold">{t(`imp.sheet.${e.sheet}`)} · {t("imp.row", { n: e.row })}:</span> {e.message}</li>
                ))}
              </ul>
            </>
          ) : plan.saved ? (
            <Alert tone="green">
              {t("imp.done")} <Link href="/products" className="font-semibold underline">{t("nav.products")}</Link> · <Link href="/assets?tab=molds" className="font-semibold underline">{t("md.molds")}</Link>
            </Alert>
          ) : plan.empty || total === 0 ? (
            <Alert tone="blue">{t("imp.nothing")}</Alert>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Alert tone="green">{t("imp.ready")}</Alert>
              <Button type="button" onClick={() => send("save")} disabled={pending}><Upload className="size-4" /> {pending ? t("common.saving") : t("imp.import", { n: total })}</Button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
