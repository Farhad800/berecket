import { describe, expect, it } from "vitest";
import { amountInWords } from "../../src/lib/num-words";
import { normalize } from "../../src/lib/receipt-layout";

describe("amount in words (receipts)", () => {
  it("Arabic", () => {
    expect(amountInWords(2_500_000, "IQD", "ar")).toBe("فقط مليونان وخمسمائة ألف دينار عراقي لا غير");
    expect(amountInWords(3000, "IQD", "ar")).toBe("فقط ثلاثة آلاف دينار عراقي لا غير");
    expect(amountInWords(21.5, "USD", "ar")).toBe("فقط واحد وعشرون دولار أمريكي وخمسون سنت لا غير");
  });
  it("English", () => {
    expect(amountInWords(1_450_250, "IQD", "en")).toBe("One million four hundred and fifty thousand two hundred and fifty Iraqi dinars only");
    expect(amountInWords(2701.25, "USD", "en")).toBe("Two thousand seven hundred and one US dollars and twenty-five cents only");
  });
  it("Turkish", () => {
    expect(amountInWords(1000, "EUR", "tr")).toBe("Yalnız bin avro");
    expect(amountInWords(1_150, "EUR", "tr")).toBe("Yalnız bin yüz elli avro");
  });
  it("old / partial layouts get every option", () => {
    const s = normalize({ fields: { phone: false }, columns: [{ key: "total", show: true }] });
    expect(s.fields.phone).toBe(false);
    expect(s.fields.words).toBe(true);
    expect(s.columns.map((c) => c.key)).toEqual(["total", "no", "code", "name", "name2", "qty", "unit", "price"]);
  });
});
