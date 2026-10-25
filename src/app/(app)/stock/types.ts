import type { Tone } from "@/components/ui";
export const DOC_TYPES = ["INPUT", "OUTPUT", "BUY", "SELL"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_TONE: Record<DocType, Tone> = { INPUT: "green", OUTPUT: "amber", BUY: "blue", SELL: "purple" };
export const DOC_PERM = { INPUT: "stock:input", OUTPUT: "stock:output", BUY: "stock:buy", SELL: "stock:sell" } as const;
export const fmtQty = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });
export const fmtMoney = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
