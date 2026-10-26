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

/**
 * Exchange (accountant, 26 Oct 2026): FROM amount, TO amount and the rate — any two give the third.
 * The rate is always written as "1 of the stronger currency = rate of the other" (EUR > USD > IQD),
 * e.g. 1 USD = 1,450 IQD whichever way the money goes.
 */
const STRENGTH: Record<string, number> = { EUR: 3, USD: 2, IQD: 1 };
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
export function rateSides(from: string, to: string) {
  const fromStrong = (STRENGTH[from] ?? 0) >= (STRENGTH[to] ?? 0);
  return { fromStrong, strong: fromStrong ? from : to, weak: fromStrong ? to : from };
}
/** TO amount from the FROM amount and the rate. */
export const exchangeTo = (fromAmt: number, rate: number, fromStrong: boolean) => (rate > 0 ? round2(fromStrong ? fromAmt * rate : fromAmt / rate) : 0);
/** FROM amount from the TO amount and the rate. */
export const exchangeFrom = (toAmt: number, rate: number, fromStrong: boolean) => (rate > 0 ? round2(fromStrong ? toAmt / rate : toAmt * rate) : 0);
/** The rate from both amounts. */
export const exchangeRate = (fromAmt: number, toAmt: number, fromStrong: boolean) => (fromAmt > 0 && toAmt > 0 ? round6(fromStrong ? toAmt / fromAmt : fromAmt / toAmt) : 0);
/** null when the two amounts and the rate agree (allowing for rounding to cents and 6-decimal rates). */
export function exchangeProblem(fromAmt: number, toAmt: number, rate: number, fromStrong: boolean): string | null {
  const strong = fromStrong ? fromAmt : toAmt, weak = fromStrong ? toAmt : fromAmt;
  const tol = 0.006 + 0.006 * rate + strong * 6e-7;
  return Math.abs(weak - strong * rate) <= tol ? null : "The two amounts and the rate don't match. Check them.";
}
/** Readable rate of a saved exchange (old entries kept "1 given = rate received"; new ones are always ≥ 1). */
export function rateText(rate: number, a: string, b: string) {
  const { strong, weak } = rateSides(a, b);
  const r = rate >= 1 ? rate : 1 / rate;
  return `1 ${strong} = ${r.toLocaleString("en", { maximumFractionDigits: 6 })} ${weak}`;
}
