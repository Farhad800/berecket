"use client";

import { useTranslations } from "next-intl";

/** Dropdown to narrow a long product sheet to one mold's labels. */
export default function MoldSelect({ rows, value, onChange }: { rows: { mold?: string | null }[]; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("md");
  const molds = [...new Set(rows.map((r) => r.mold).filter(Boolean) as string[])].sort();
  if (molds.length === 0) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("mold")} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink">
      <option value="">{t("allMolds")}</option>
      {molds.map((m) => <option key={m} value={m}>{m}</option>)}
      {rows.some((r) => !r.mold) && <option value="-">{t("noMold")}</option>}
    </select>
  );
}

export const moldMatch = (mold: string | null | undefined, sel: string) => !sel || (sel === "-" ? !mold : mold === sel);

/** True when this row starts a new mold group (rows are sorted by mold). */
export const newGroup = <R extends { mold?: string | null }>(list: R[], i: number) => i === 0 || list[i - 1].mold !== list[i].mold;
