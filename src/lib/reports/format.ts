import { formatDate, formatDateTime, formatNumber, toFactoryDateInput, toFactoryDateTimeInput } from "@/lib/time";
import type { Cell, Column, Kpi, Row } from "./types";

// next-intl's translator, loosely typed so dynamic keys are allowed.
export type T = (key: string, values?: Record<string, string | number>) => string;

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/** Text shown on screen and in the printable PDF. */
export function cellText(col: Column, v: Cell | Record<string, string>, t: T, locale: string): string {
  if (isEmpty(v)) return "—";
  const n = (x: number) => formatNumber(x, locale);
  switch (col.type) {
    case "int": return n(Number(v));
    case "signed": return Number(v) > 0 ? `+${n(Number(v))}` : `−${n(Math.abs(Number(v)))}`;
    case "pct": return `${n(Number(v))}%`;
    case "hours": return t("rep.unit.h", { n: n(Number(v)) });
    case "days": return t("rep.unit.d", { n: n(Number(v)) });
    case "date": return formatDate(v as Date, locale);
    case "datetime": return formatDateTime(v as Date, locale);
    case "status": return col.ns && !String(v).startsWith("=") ? t(`${col.ns}.${String(v)}`) : String(v).replace(/^=/, "");
    case "yesno": return v === "yes" ? t("common.yes") : t("common.no");
    default: return String(v);
  }
}

/** Value written to CSV: numbers stay plain numbers so Excel can calculate with them. */
export function cellCsv(col: Column, v: Cell | Record<string, string>, t: T): string | number {
  if (isEmpty(v)) return "";
  switch (col.type) {
    case "int": case "signed": case "pct": case "hours": case "days": return Number(v);
    case "date": return toFactoryDateInput(v as Date);
    case "datetime": return toFactoryDateTimeInput(v as Date).replace("T", " ");
    case "status": return col.ns && !String(v).startsWith("=") ? t(`${col.ns}.${String(v)}`) : String(v).replace(/^=/, "");
    case "yesno": return v === "yes" ? t("common.yes") : t("common.no");
    default: return String(v);
  }
}

export function kpiText(k: Kpi, t: T, locale: string) {
  if (k.value === null) return "—";
  return cellText({ key: "", label: "", type: k.type }, k.value, t, locale);
}

export function totalsRow(columns: Column[], rows: Row[]): Row {
  const out: Row = {};
  for (const c of columns) if (c.total) out[c.key] = Math.round(rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0) * 10) / 10;
  return out;
}

/** CSV with a UTF-8 BOM so Excel shows Arabic and Turkish characters correctly. */
export function toCsv(header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    let s = String(v);
    // Neutralise spreadsheet formulas typed into free-text fields (CSV injection).
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
