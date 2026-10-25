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
