"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Input, Select } from "@/components/ui";
import { CURS, fmtMoney, type CurCode } from "./types";

/** Shows the whole safe as one total at rates typed here. Nothing is changed in the safe. */
export default function Converter({ bal, usdRate, eurRate }: { bal: Record<CurCode, number>; usdRate: number | null; eurRate: number | null }) {
  const t = useTranslations();
  const [usd, setUsd] = useState(usdRate ? String(usdRate) : "");
  const [eur, setEur] = useState(eurRate ? String(eurRate) : "");
  const [to, setTo] = useState<CurCode>("IQD");
  const perIqd: Record<CurCode, number> = { IQD: 1, USD: Number(usd) || 0, EUR: Number(eur) || 0 };
  const ready = perIqd[to] > 0 && CURS.every((c) => bal[c] === 0 || perIqd[c] > 0);
  const total = ready ? CURS.reduce((s, c) => s + bal[c] * perIqd[c], 0) / perIqd[to] : null;
  return (
    <Card>
      <h2 className="font-semibold">{t("cash.convertTitle")}</h2>
      <p className="text-xs text-muted">{t("cash.convertHint")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
        <label className="text-sm font-medium">1 USD = … IQD<Input type="number" min={0} step="any" value={usd} onChange={(e) => setUsd(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label="1 USD in IQD" /></label>
        <label className="text-sm font-medium">1 EUR = … IQD<Input type="number" min={0} step="any" value={eur} onChange={(e) => setEur(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label="1 EUR in IQD" /></label>
        <label className="text-sm font-medium">{t("cash.showIn")}<Select value={to} onChange={(e) => setTo(e.target.value as CurCode)} className="mt-1" aria-label={t("cash.showIn")}>{CURS.map((c) => <option key={c} value={c}>{c}</option>)}</Select></label>
        <p className="text-sm">{t("cash.totalValue")}<br /><b className="text-xl tabular-nums" dir="ltr" data-testid="converted">{total === null ? "—" : `${fmtMoney(Math.round(total * 100) / 100)} ${to}`}</b></p>
      </div>
    </Card>
  );
}
