import type { Tone } from "@/components/ui";
export const CURS = ["IQD", "USD", "EUR"] as const;
export type CurCode = (typeof CURS)[number];
export const KINDS = ["DEPOSIT", "EXPENSE", "SALE", "PURCHASE", "EXCHANGE", "TRANSFER"] as const;
export const KIND_TONE: Record<(typeof KINDS)[number], Tone> = { DEPOSIT: "green", EXPENSE: "red", SALE: "purple", PURCHASE: "blue", EXCHANGE: "amber", TRANSFER: "gray" };
export const fmtMoney = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** Built-in categories are translated by key; ones the admin added show their own name. */
export const catName = (t: (k: string) => string, c: { key: string | null; name: string } | null | undefined) => (c ? (c.key ? t(`cash.cat.${c.key}`) : c.name) : "");
