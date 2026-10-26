"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HandCoins } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { payDocAction } from "@/app/actions/cash";
import SafeSelect, { fitSafe, type SafeOpt } from "../../cash/safe-select";
import type { CurCode } from "../../cash/types";

/** Adds a later payment to a Buy / Sell document (money into or out of the safe). */
export default function PayForm({ docId, owed, currency, sell, safes }: { docId: string; owed: number; currency: string; sell: boolean; safes: SafeOpt[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [amount, setAmount] = useState(String(owed));
  const [note, setNote] = useState("");
  const [safeChoice, setSafeChoice] = useState("");
  const safeId = fitSafe(safes, currency as CurCode, safeChoice);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError(null);
    const r = await payDocAction({ docId, safeId: safeId || undefined, amount, note: note || undefined });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.refresh();
  });
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <div className="grid gap-2 sm:grid-cols-[10rem_12rem_1fr_auto] sm:items-end">
        <label className="text-sm font-medium">{t("cash.amount")} ({currency})
          <Input type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t("cash.amount")} />
        </label>
        <SafeSelect safes={safes} currency={currency as CurCode} value={safeId} onChange={setSafeChoice} label={t(sell ? "safe.intoSafe" : "safe.outOfSafe")} />
        <label className="text-sm font-medium">{t("sd.note")}
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" aria-label={t("sd.note")} />
        </label>
        <Button onClick={save} disabled={pending || !(Number(amount) > 0)}><HandCoins className="size-4" /> {pending ? t("common.saving") : t(sell ? "cash.receive" : "cash.pay")}</Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
