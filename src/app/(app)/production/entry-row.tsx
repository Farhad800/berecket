"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { fmtIqd } from "@/lib/cost";
import { Pencil } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Badge, Button, Input } from "@/components/ui";
import { correctEntryAction } from "@/app/actions/production";

type E = { id: string; day: string; shift: string; product: string; quantity: number; qcStatus: string; by: string; locked: boolean; cost?: { run: number; perPiece: number; complete: boolean } | null };
const TONE = { NOT_INSPECTED: "gray", APPROVED: "green", REJECTED: "red" } as const;

/** One production entry, with an inline "correct a typing mistake" form. */
export default function EntryRow({ e, showDay, canFix }: { e: E; showDay: boolean; canFix: boolean }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, error } = useFormAction(correctEntryAction, { onSuccess: () => setOpen(false) });
  return (
    <li className="px-4 py-2.5">
      <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 md:grid-cols-[3rem_1fr_7rem_8rem_8rem]">
        <span className="text-xs font-semibold text-muted">{showDay ? <span dir="ltr">{e.day}</span> : e.shift}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{e.product}</p>
          <p className="text-xs text-muted">{showDay && `${t("rep.col.shift")} ${e.shift} · `}{e.by}</p>
          {e.cost && <p className="text-xs text-muted" data-testid="run-real-cost"><span dir="ltr">{t("lot.runCost", { piece: fmtIqd(e.cost.perPiece), run: fmtIqd(e.cost.run) })}</span>{!e.cost.complete && <span className="text-amber-600" title={t("cost.partial")}> *</span>}</p>}
        </div>
        <span className="text-end text-base font-bold tabular-nums">{e.quantity.toLocaleString("en")}</span>
        <span className="col-start-2 md:col-start-auto">
          <Link href={`/qc/entries/${e.id}`}><Badge tone={TONE[e.qcStatus as keyof typeof TONE]}>{t(`status.entryQc.${e.qcStatus}`)}</Badge></Link>
        </span>
        <span className="text-end">
          {canFix && !e.locked && !open && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil className="size-3.5" /> {t("prod.correct")}</Button>
          )}
        </span>
      </div>
      {open && (
        <form onSubmit={onSubmit} className="mt-2 grid gap-2 rounded-xl border border-line bg-surface-2 p-3 sm:grid-cols-[8rem_1fr_auto_auto] sm:items-end">
          <input type="hidden" name="entryId" value={e.id} />
          {error && <div className="sm:col-span-4"><Alert>{error}</Alert></div>}
          <label className="text-xs font-semibold text-muted">{t("prod.correctQty")}
            <Input name="quantity" type="number" min={0} step={1} defaultValue={e.quantity} required dir="ltr" className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-muted">{t("prod.reason")}
            <Input name="reason" required minLength={3} placeholder={t("prod.correctReasonHint")} className="mt-1" />
          </label>
          <Button type="submit" size="sm" disabled={pending}>{t("common.save")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <p className="text-xs text-muted sm:col-span-4">{t("prod.correctHelp")}</p>
        </form>
      )}
    </li>
  );
}
