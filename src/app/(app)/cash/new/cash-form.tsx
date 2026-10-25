"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { Alert, Button, Card, Input, Select, Textarea, cn } from "@/components/ui";
import { exchangeCashAction, saveCashAction } from "@/app/actions/cash";
import { CURS, fmtMoney, type CurCode } from "../types";

export type CashType = "IN" | "OUT" | "EXCHANGE";

/** Money in · money out (expense) · exchange between currencies. */
export default function CashForm({ allowed, initialType, balances, categories }: {
  allowed: CashType[]; initialType: CashType; balances: Record<CurCode, number>; categories: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [type, setType] = useState<CashType>(initialType);
  const [currency, setCurrency] = useState<CurCode>("IQD");
  const [to, setTo] = useState<CurCode>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(amount) || 0;
  const goesOut = type !== "IN";
  const over = goesOut && n > balances[currency] + 1e-9;
  const got = Math.round(n * (Number(rate) || 0) * 100) / 100;

  const save = () => start(async () => {
    setError(null);
    const r = type === "EXCHANGE"
      ? await exchangeCashAction({ from: currency, to, amount, rate, note: note || undefined })
      : await saveCashAction({ type, currency, amount, categoryId: type === "OUT" ? categoryId || undefined : undefined, party: party || undefined, note: note || undefined });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/cash/${r.data.id}?saved=1`);
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {allowed.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={type === d} onClick={() => setType(d)}
            className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", type === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
            {t(`cash.new.${d}`)}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{t(`cash.help.${type}`)}</p>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">{t(type === "EXCHANGE" ? "cash.give" : "cash.currency")}
            <Select value={currency} onChange={(e) => { const c = e.target.value as CurCode; setCurrency(c); if (c === to) setTo(CURS.find((x) => x !== c)!); }} className="mt-1" aria-label={t(type === "EXCHANGE" ? "cash.give" : "cash.currency")}>
              {CURS.map((c) => <option key={c} value={c}>{c} — {t(`cash.cur.${c}`)}</option>)}
            </Select>
            {goesOut && <span className="text-xs font-normal text-muted" dir="ltr">{t("cash.inSafe")}: {fmtMoney(balances[currency])} {currency}</span>}
          </label>
          <label className="text-sm font-medium">{t("cash.amount")} *
            <Input type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t("cash.amount")} />
            {over && <span className="text-xs font-semibold text-red-600">{t("cash.notEnough")}</span>}
          </label>
          {type === "EXCHANGE" && (
            <>
              <label className="text-sm font-medium">{t("cash.receiveCur")}
                <Select value={to} onChange={(e) => setTo(e.target.value as CurCode)} className="mt-1" aria-label={t("cash.receiveCur")}>
                  {CURS.filter((c) => c !== currency).map((c) => <option key={c} value={c}>{c} — {t(`cash.cur.${c}`)}</option>)}
                </Select>
              </label>
              <label className="text-sm font-medium">{t("cash.rate", { from: currency, to })} *
                <Input type="number" inputMode="decimal" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t("cash.rateLabel")} />
              </label>
              <p className="text-sm sm:col-span-2">{t("cash.youGet")} <b className="text-lg" dir="ltr" data-testid="exchange-got">{fmtMoney(got)} {to}</b></p>
            </>
          )}
          {type === "OUT" && (
            <label className="text-sm font-medium">{t("cash.category")} *
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1" aria-label={t("cash.category")}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
          )}
          {type !== "EXCHANGE" && (
            <label className="text-sm font-medium">{t(type === "IN" ? "cash.from" : "cash.paidTo")}
              <Input value={party} onChange={(e) => setParty(e.target.value)} className="mt-1" aria-label={t(type === "IN" ? "cash.from" : "cash.paidTo")} />
            </label>
          )}
          <label className="text-sm font-medium sm:col-span-2">{t("sd.note")}{type === "IN" && " *"}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" aria-label={t("sd.note")} />
          </label>
        </div>
      </Card>
      {error && <Alert>{error}</Alert>}
      <Button onClick={save} disabled={pending || !(n > 0) || over || (type === "EXCHANGE" && !(Number(rate) > 0))}><Save className="size-4" /> {pending ? t("common.saving") : t(`cash.save.${type}`)}</Button>
    </div>
  );
}
