"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, cn } from "@/components/ui";
import { fmtIqd } from "@/lib/cost";

export type Section = "ALL" | "PRODUCT" | "STICKER" | "MATERIAL" | "PACKAGING";
export type SectionValue = { value: number; items: number; noCost: number };

/** Value of what is in stock, in IQD: all sections together or one section. Money roles only. */
export default function StockValue({ values, initial }: { values: Record<Exclude<Section, "ALL">, SectionValue>; initial: Section }) {
  const t = useTranslations();
  const [pick, setPick] = useState<Section>(initial);
  const keys = ["PRODUCT", "STICKER", "MATERIAL", "PACKAGING"] as const;
  const all: SectionValue = keys.reduce((a, k) => ({ value: a.value + values[k].value, items: a.items + values[k].items, noCost: a.noCost + values[k].noCost }), { value: 0, items: 0, noCost: 0 });
  const v = pick === "ALL" ? all : values[pick];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("cost.stockValue")}</h2>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("cost.valueOf")}>
          {(["ALL", ...keys] as Section[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={pick === k} onClick={() => setPick(k)}
              className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold", pick === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-muted hover:text-ink")}>
              {k === "ALL" ? t("item.allSections") : t(`md.kindPlural.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums" dir="ltr" data-testid="stock-value">{fmtIqd(Math.round(v.value * 100) / 100)} IQD</p>
      <p className="text-xs text-muted">{t("cost.valueHint", { n: v.items.toLocaleString("en") })}{v.noCost > 0 && <span className="font-semibold text-amber-600"> · {t("cost.valueNoCost", { n: v.noCost.toLocaleString("en") })}</span>}</p>
      {pick === "ALL" && (
        <ul className="mt-3 grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-4">
          {keys.map((k) => (
            <li key={k} className="flex justify-between gap-2 sm:block">
              <span className="text-muted">{t(`md.kindPlural.${k}`)}</span>
              <b className="block tabular-nums sm:mt-0.5" dir="ltr" data-testid={`value-${k}`}>{fmtIqd(Math.round(values[k].value * 100) / 100)} IQD</b>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
