/**
 * Money rules for Buy / Sell documents (shared by the form, the server, pages, receipts):
 *  - a unit price may have up to 6 decimals (e.g. 0.005 USD per label);
 *  - each line total is rounded to cents;
 *  - the document total is the sum of the line totals, so lines always add up to the total.
 */
export const PRICE_DECIMALS = 6;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const lineTotal = (qty: number, price: number) => round2(qty * price);
export const docTotal = (lines: { qty: number; price: number }[]) => round2(lines.reduce((s, l) => s + lineTotal(l.qty, l.price), 0));
/** True when n has at most `d` decimals (tolerant of floating-point noise, e.g. 1.001). */
export const maxDecimals = (n: number, d: number) => Math.abs(n * 10 ** d - Math.round(n * 10 ** d)) < 1e-6 * Math.max(1, Math.abs(n * 10 ** d) / 1e6);
/** Unit prices: up to 6 decimals, no trailing zeros (0.005, 250, 1.25). */
export const fmtPrice = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: PRICE_DECIMALS });

// ── Sale discounts (accountant, 26 Oct 2026): per line and/or on the whole invoice, as % or an amount.
export type Discount = { kind: "PERCENT" | "AMOUNT"; value: number } | null | undefined;
/** The discount in money on `base` (rounded to cents). */
export const discountOf = (base: number, d: Discount) =>
  !d || !(d.value > 0) ? 0 : round2(d.kind === "PERCENT" ? (base * d.value) / 100 : d.value);
/** Why a discount can't be used on `base`, or null. */
export function discountProblem(base: number, d: Discount): string | null {
  if (!d || !(d.value > 0)) return null;
  if (d.kind === "PERCENT" && d.value > 100) return "A discount can't be more than 100%.";
  if (d.kind === "PERCENT" && !maxDecimals(d.value, 4)) return "A % discount can have at most 4 decimals.";
  if (d.kind === "AMOUNT" && !maxDecimals(d.value, 2)) return "A discount amount can have at most 2 decimals.";
  if (discountOf(base, d) > base + 1e-9) return "The discount is more than the amount.";
  return null;
}
/**
 * Sale totals: each line = qty × price − its discount (cents); subtotal = sum of the lines;
 * total = subtotal − the invoice discount. What the receipt prints always adds up.
 */
export function saleTotals(lines: { qty: number; price: number; discount?: Discount }[], invoiceDiscount?: Discount) {
  const rows = lines.map((l) => {
    const gross = lineTotal(l.qty, l.price);
    const discount = discountOf(gross, l.discount);
    return { gross, discount, net: round2(gross - discount) };
  });
  const subtotal = round2(rows.reduce((s, r) => s + r.net, 0));
  const discount = discountOf(subtotal, invoiceDiscount);
  return { lines: rows, subtotal, discount, total: round2(subtotal - discount) };
}
