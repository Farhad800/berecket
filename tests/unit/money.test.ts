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
