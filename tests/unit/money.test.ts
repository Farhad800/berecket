import { describe, expect, it } from "vitest";
import { docTotal, fmtPrice, lineTotal, maxDecimals } from "../../src/lib/money";

describe("Buy / Sell money rules", () => {
  it("small unit prices give the right totals", () => {
    expect(lineTotal(20_000, 0.005)).toBe(100);
    expect(docTotal([{ qty: 20_000, price: 0.005 }, { qty: 1800, price: 250 }])).toBe(450_100);
  });
  it("the document total equals the sum of the printed line totals", () => {
    const lines = [{ qty: 3, price: 0.333333 }, { qty: 7, price: 1.234567 }, { qty: 1.5, price: 2.005 }];
    const printed = lines.map((l) => lineTotal(l.qty, l.price)).reduce((a, b) => a + b, 0);
    expect(docTotal(lines)).toBeCloseTo(printed, 10);
  });
  it("decimal checks are not fooled by floating point", () => {
    expect(maxDecimals(1.001, 3)).toBe(true);
    expect(maxDecimals(0.005, 6)).toBe(true);
    expect(maxDecimals(1.234567, 6)).toBe(true);
    expect(maxDecimals(0.0000005, 6)).toBe(false);
    expect(maxDecimals(1.2345678, 6)).toBe(false);
    let bad = 0;
    for (let i = 1; i <= 100_000; i++) if (!maxDecimals(i / 1_000_000, 6)) bad++;
    expect(bad).toBe(0);
  });
  it("kg amounts: every value with 3 decimals is accepted, 4 decimals refused (M1)", () => {
    let bad = 0;
    for (let i = 1; i <= 2_000_000; i++) if (!maxDecimals(i / 1000, 3)) bad++;
    expect(bad).toBe(0);
    for (const v of [1.0015, 0.0001, 2.0004, 123.4565]) expect(maxDecimals(v, 3)).toBe(false);
    expect(maxDecimals(50_000_000, 3)).toBe(true);
    expect(maxDecimals(49_999_999.999, 3)).toBe(true);
  });
  it("prices print with up to 6 decimals", () => {
    expect(fmtPrice(0.005)).toBe("0.005");
    expect(fmtPrice(250)).toBe("250");
    expect(fmtPrice(1.234567)).toBe("1.234567");
  });
});

import { discountOf, discountProblem, saleTotals } from "../../src/lib/money";
describe("sale discounts", () => {
  it("line and invoice discounts, % and amount", () => {
    const t = saleTotals(
      [{ qty: 1800, price: 250, discount: { kind: "PERCENT", value: 10 } }, { qty: 5000, price: 50, discount: { kind: "AMOUNT", value: 10_000 } }, { qty: 3, price: 0.333333 }],
      { kind: "AMOUNT", value: 50_000 },
    );
    expect(t.lines.map((l) => l.net)).toEqual([405_000, 240_000, 1]);
    expect(t.subtotal).toBe(645_001);
    expect(t.discount).toBe(50_000);
    expect(t.total).toBe(595_001);
    const p = saleTotals([{ qty: 3, price: 33.33 }], { kind: "PERCENT", value: 12.5 });
    expect(p.subtotal).toBe(99.99);
    expect(p.discount).toBe(12.5);
    expect(p.total).toBe(87.49);
  });
  it("no discount = old behaviour", () => {
    expect(saleTotals([{ qty: 20_000, price: 0.005 }]).total).toBe(100);
    expect(discountOf(100, null)).toBe(0);
  });
  it("refuses impossible discounts", () => {
    expect(discountProblem(100, { kind: "PERCENT", value: 101 })).toMatch(/100%/);
    expect(discountProblem(100, { kind: "AMOUNT", value: 100.01 })).toMatch(/more than/);
    expect(discountProblem(100, { kind: "AMOUNT", value: 100 })).toBeNull();
    expect(discountProblem(100, { kind: "AMOUNT", value: 1.234 })).toMatch(/decimals/);
  });
});

import { exchangeFrom, exchangeProblem, exchangeRate, exchangeTo, rateSides, rateText } from "@/lib/money";

describe("exchange with three boxes (any two give the third)", () => {
  it("writes the rate as 1 of the stronger currency, whichever way the money goes", () => {
    expect(rateSides("USD", "IQD")).toEqual({ fromStrong: true, strong: "USD", weak: "IQD" });
    expect(rateSides("IQD", "USD")).toEqual({ fromStrong: false, strong: "USD", weak: "IQD" });
    expect(rateSides("USD", "EUR").strong).toBe("EUR");
  });
  it("calculates the missing box", () => {
    expect(exchangeTo(1000, 1450, true)).toBe(1_450_000); // 1,000 USD → IQD
    expect(exchangeTo(1_460_000, 1460, false)).toBe(1000); // IQD → USD
    expect(exchangeFrom(500, 1470, false)).toBe(735_000); // receive 500 USD, give IQD
    expect(exchangeRate(1_460_000, 1000, false)).toBe(1460);
    expect(exchangeRate(1000, 1_450_000, true)).toBe(1450);
  });
  it("accepts rounding but refuses amounts that don't match the rate", () => {
    expect(exchangeProblem(1000, 1_450_000, 1450, true)).toBeNull();
    expect(exchangeProblem(333.33, 483_328.5, 1450, true)).toBeNull();
    expect(exchangeProblem(1_000_000, 689.66, 1450, false)).toBeNull(); // 1,000,000 IQD at 1,450 → 689.66 USD
    expect(exchangeProblem(1000, 1_500_000, 1450, true)).not.toBeNull();
  });
  it("shows old and new saved rates the same way", () => {
    expect(rateText(1450, "USD", "IQD")).toBe("1 USD = 1,450 IQD");
    expect(rateText(1 / 1450, "IQD", "USD")).toBe("1 USD = 1,450 IQD"); // older entry: 1 IQD = 0.00069 USD
  });
});
