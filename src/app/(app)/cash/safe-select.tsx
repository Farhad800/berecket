"use client";

import { useTranslations } from "next-intl";
import { Select } from "@/components/ui";
import { fmtMoney, type CurCode } from "./types";

export type SafeOpt = { id: string; name: string; currencies: CurCode[]; isMain: boolean; balance: Record<CurCode, number> | null };

/** The safes that hold this currency (all when no currency is given). */
export const safesFor = (safes: SafeOpt[], currency?: CurCode) => (currency ? safes.filter((s) => s.currencies.includes(currency)) : safes);
/** Keeps the chosen safe if it holds the currency, else the first one that does. */
export const fitSafe = (safes: SafeOpt[], currency: CurCode | undefined, current: string) => {
  const ok = safesFor(safes, currency);
  return ok.some((s) => s.id === current) ? current : ok[0]?.id ?? "";
};

/** Choose a safe; with a currency, only safes holding it are offered, each with what it has. */
export default function SafeSelect({ safes, currency, value, onChange, label, exclude }: {
  safes: SafeOpt[]; currency?: CurCode; value: string; onChange: (id: string) => void; label?: string; exclude?: string;
}) {
  const t = useTranslations();
  const list = safesFor(safes, currency).filter((s) => s.id !== exclude);
  const lbl = label ?? t("safe.safe");
  return (
    <label className="text-sm font-medium">{lbl}
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" aria-label={lbl}>
        {list.length === 0 && <option value="">{t("safe.noneHolds", { currency: currency ?? "" })}</option>}
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.balance && currency ? ` — ${fmtMoney(s.balance[currency])} ${currency}` : ""}
          </option>
        ))}
      </Select>
    </label>
  );
}
