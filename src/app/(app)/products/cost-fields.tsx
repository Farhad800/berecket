"use client";

import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui";
import { fmtIqd } from "@/lib/cost";

export type CostInput = { price: string; currency: "IQD" | "USD" | "EUR"; rate: string };
export const emptyCost = (): CostInput => ({ price: "", currency: "IQD", rate: "" });
/** IQD per unit, or null when something is missing. */
export const costIqd = (c: CostInput) => {
  const p = Number(c.price), r = c.currency === "IQD" ? 1 : Number(c.rate);
  return c.price !== "" && p >= 0 && r > 0 ? Math.round(p * r * 1e6) / 1e6 : null;
};
export const costPayload = (c: CostInput) => (c.price === "" ? undefined : { price: c.price, currency: c.currency, rate: c.currency === "IQD" ? undefined : c.rate });

/** Price of one unit + currency; for USD / EUR also the rate of the day to IQD. */
export default function CostFields({ value, onChange, unit }: { value: CostInput; onChange: (v: CostInput) => void; unit: string }) {
  const t = useTranslations();
  const per = unit === "kg" ? "1 kg" : t("cost.onePiece");
  const iqd = costIqd(value);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-medium">{t("cost.price", { per })}
        <Input type="number" inputMode="decimal" min={0} step="any" value={value.price} onChange={(e) => onChange({ ...value, price: e.target.value })} dir="ltr" className="mt-1 text-end" aria-label={t("cost.priceLabel")} />
      </label>
      <label className="text-sm font-medium">{t("cash.currency")}
        <Select value={value.currency} onChange={(e) => onChange({ ...value, currency: e.target.value as CostInput["currency"] })} className="mt-1" aria-label={t("cost.currency")}>
          {(["IQD", "USD", "EUR"] as const).map((c) => <option key={c} value={c}>{c} — {t(`cash.cur.${c}`)}</option>)}
        </Select>
      </label>
      {value.currency !== "IQD" ? (
        <label className="text-sm font-medium">{t("cost.rate", { cur: value.currency })} *
          <Input type="number" inputMode="decimal" min={0} step="any" value={value.rate} onChange={(e) => onChange({ ...value, rate: e.target.value })} dir="ltr" className="mt-1 text-end" aria-label={t("cost.rateLabel")} />
          <span className="text-xs font-normal text-muted">{t("cost.rateHint")}</span>
        </label>
      ) : <span />}
      {value.price !== "" && (
        <p className="text-sm sm:col-span-3" data-testid="cost-iqd">{t("cost.inIqd")}: <b dir="ltr">{iqd === null ? "—" : `${fmtIqd(iqd)} IQD`}</b> / {per}</p>
      )}
    </div>
  );
}
