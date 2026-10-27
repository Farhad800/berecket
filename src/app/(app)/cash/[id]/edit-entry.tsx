"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Save, X } from "lucide-react";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { editCashAction } from "@/app/actions/cash";
import SafeSelect, { type SafeOpt } from "../safe-select";
import type { CurCode } from "../types";

export type EntryForEdit = {
  id: string; kind: string; currency: CurCode; amount: number; safeId: string; categoryId: string; party: string; note: string;
  fromAmount?: number; toAmount?: number; rate?: number; fromCur?: string; toCur?: string;
};

/** Change a saved money entry (same number), with the reason why. */
export default function EditEntry({ e, safes, cats }: { e: EntryForEdit; safes: SafeOpt[]; cats: { id: string; label: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ amount: String(e.amount), safeId: e.safeId, categoryId: e.categoryId, party: e.party, note: e.note, fromAmount: String(e.fromAmount ?? ""), toAmount: String(e.toAmount ?? ""), rate: String(e.rate ?? ""), reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const one = !["EXCHANGE", "TRANSFER"].includes(e.kind);
  const save = () => start(async () => {
    setError(null);
    const r = await editCashAction({
      id: e.id, reason: v.reason, note: v.note,
      ...(one ? { amount: v.amount, safeId: v.safeId, ...(e.kind === "EXPENSE" ? { categoryId: v.categoryId } : {}), ...(e.kind === "DEPOSIT" || e.kind === "EXPENSE" ? { party: v.party } : {}) } : {}),
      ...(e.kind === "TRANSFER" ? { amount: v.amount } : {}),
      ...(e.kind === "EXCHANGE" ? { fromAmount: v.fromAmount, toAmount: v.toAmount, rate: v.rate || undefined } : {}),
    });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    setOpen(false); setV({ ...v, reason: "" }); router.refresh();
  });
  if (!open) return <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}><Pencil className="size-4" /> {t("cash.edit")}</Button>;
  return (
    <Card className="mt-4">
      <h2 className="mb-2 font-semibold">{t("cash.edit")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {(one || e.kind === "TRANSFER") && (
          <label className="text-sm font-medium">{t("cash.amount")} ({e.currency})
            <Input type="number" inputMode="decimal" min={0} step="any" value={v.amount} onChange={(x) => setV({ ...v, amount: x.target.value })} dir="ltr" className="mt-1 text-end" aria-label={t("cash.editAmount")} />
          </label>
        )}
        {one && safes.length > 1 && <SafeSelect safes={safes} currency={e.currency} value={v.safeId} onChange={(id) => setV({ ...v, safeId: id })} label={t("cash.editSafe")} />}
        {e.kind === "EXPENSE" && (
          <label className="text-sm font-medium">{t("cash.category")}
            <Select value={v.categoryId} onChange={(x) => setV({ ...v, categoryId: x.target.value })} className="mt-1" aria-label={t("cash.category")}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </label>
        )}
        {(e.kind === "DEPOSIT" || e.kind === "EXPENSE") && (
          <label className="text-sm font-medium">{t(e.kind === "EXPENSE" ? "cash.paidTo" : "cash.from")}
            <Input value={v.party} onChange={(x) => setV({ ...v, party: x.target.value })} className="mt-1" aria-label={t(e.kind === "EXPENSE" ? "cash.paidTo" : "cash.from")} />
          </label>
        )}
        {e.kind === "EXCHANGE" && (
          <>
            <label className="text-sm font-medium">{t("cash.editFrom", { cur: e.fromCur ?? "" })}
              <Input type="number" inputMode="decimal" min={0} step="any" value={v.fromAmount} onChange={(x) => setV({ ...v, fromAmount: x.target.value })} dir="ltr" className="mt-1 text-end" aria-label={t("cash.editFrom", { cur: e.fromCur ?? "" })} />
            </label>
            <label className="text-sm font-medium">{t("cash.editTo", { cur: e.toCur ?? "" })}
              <Input type="number" inputMode="decimal" min={0} step="any" value={v.toAmount} onChange={(x) => setV({ ...v, toAmount: x.target.value })} dir="ltr" className="mt-1 text-end" aria-label={t("cash.editTo", { cur: e.toCur ?? "" })} />
            </label>
            <label className="text-sm font-medium">{t("cash.rateLabel")}
              <Input type="number" inputMode="decimal" min={0} step="any" value={v.rate} onChange={(x) => setV({ ...v, rate: x.target.value })} dir="ltr" className="mt-1 text-end" aria-label={t("cash.rateLabel")} />
            </label>
          </>
        )}
        <label className="text-sm font-medium sm:col-span-2">{t("sd.note")}
          <Input value={v.note} onChange={(x) => setV({ ...v, note: x.target.value })} className="mt-1" aria-label={t("cash.editNote")} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">{t("sd.editReason")} *
          <Input value={v.reason} onChange={(x) => setV({ ...v, reason: x.target.value })} className="mt-1" aria-label={t("sd.editReason")} maxLength={500} />
        </label>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-3 flex gap-2">
        <Button onClick={save} disabled={pending || v.reason.trim().length < 3}><Save className="size-4" /> {pending ? t("common.saving") : t("sd.saveChanges")}</Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}><X className="size-4" /> {t("common.cancel")}</Button>
      </div>
    </Card>
  );
}
