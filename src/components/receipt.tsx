import { amountInWords, type WordsLang } from "@/lib/num-words";
import { fmtPrice } from "@/lib/money";
import type { ColumnKey, ReceiptData, ReceiptLang, ReceiptSettings } from "@/lib/receipt-layout";

/** Printed words in each receipt language (kept here so a receipt can differ from the screen language). */
const L = {
  ar: { SELL: "فاتورة بيع", BUY: "فاتورة شراء", PAYMENT: "وصل قبض", number: "رقم", date: "التاريخ", time: "الوقت", invoice: "رقم الفاتورة", order: "رقم الطلب",
    customer: "اسم الزبون", phone: "رقم الهاتف", by: "المحاسب", note: "ملاحظات", no: "ت", code: "الرمز", name: "اسم المادة", name2: "الاسم الثاني",
    qty: "الكمية", unit: "الوحدة", price: "السعر", total: "المجموع", grand: "المجموع الكلي", paid: "المدفوع", owed: "المتبقي", received: "المبلغ المستلم",
    forDoc: "عن فاتورة", docTotal: "مبلغ الفاتورة", paidSoFar: "المدفوع حتى الآن", sign1: "توقيع المستلم", sign2: "توقيع المحاسب", pcs: "قطعة", kg: "كغم",
    customerCode: "رمز الزبون", delivery: "مكان التسليم", discount: "الخصم", subtotal: "المجموع قبل الخصم", invDiscount: "خصم الفاتورة",
    prevBalance: "الرصيد السابق", paidNow: "المدفوع الآن", newBalance: "الرصيد الحالي", signHint: "(−) يعني أن الزبون مدين للمعمل · (+) المعمل مدين له",
    supplierRef: "رقم فاتورة المورد" },
  en: { SELL: "Sales invoice", BUY: "Purchase invoice", PAYMENT: "Payment receipt", number: "No.", date: "Date", time: "Time", invoice: "Invoice no.", order: "Order no.",
    customer: "Customer", phone: "Phone", by: "Accountant", note: "Notes", no: "#", code: "Code", name: "Item", name2: "Second name",
    qty: "Qty", unit: "Unit", price: "Price", total: "Total", grand: "Grand total", paid: "Paid", owed: "Remaining", received: "Amount received",
    forDoc: "For invoice", docTotal: "Invoice total", paidSoFar: "Paid so far", sign1: "Receiver's signature", sign2: "Accountant's signature", pcs: "pcs", kg: "kg",
    customerCode: "Customer code", delivery: "Delivery place", discount: "Discount", subtotal: "Subtotal", invDiscount: "Invoice discount",
    prevBalance: "Previous balance", paidNow: "Paid now", newBalance: "New balance", signHint: "(−) = the customer owes the factory · (+) = the factory owes them",
    supplierRef: "Supplier's invoice no." },
  tr: { SELL: "Satış faturası", BUY: "Alış faturası", PAYMENT: "Tahsilat makbuzu", number: "No", date: "Tarih", time: "Saat", invoice: "Fatura no", order: "Sipariş no",
    customer: "Müşteri", phone: "Telefon", by: "Muhasebeci", note: "Notlar", no: "#", code: "Kod", name: "Ürün", name2: "İkinci ad",
    qty: "Miktar", unit: "Birim", price: "Fiyat", total: "Tutar", grand: "Genel toplam", paid: "Ödenen", owed: "Kalan", received: "Alınan tutar",
    forDoc: "Fatura", docTotal: "Fatura tutarı", paidSoFar: "Şimdiye kadar ödenen", sign1: "Teslim alan imza", sign2: "Muhasebeci imza", pcs: "adet", kg: "kg",
    customerCode: "Müşteri kodu", delivery: "Teslim yeri", discount: "İndirim", subtotal: "Ara toplam", invDiscount: "Fatura indirimi",
    prevBalance: "Önceki bakiye", paidNow: "Şimdi ödenen", newBalance: "Yeni bakiye", signHint: "(−) = müşteri fabrikaya borçlu · (+) = fabrika ona borçlu",
    supplierRef: "Tedarikçi fatura no" },
};
type Key = keyof typeof L.en;
const money = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qtyFmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });

export function receiptLabel(lang: ReceiptLang, k: Key) {
  return lang === "ar-en" ? `${L.ar[k]} / ${L.en[k]}` : L[lang][k];
}

/** One receipt page. Pure (no hooks): the editor previews it and the print page prints it. */
export default function Receipt({ settings: s, banner, lang, data: d }: { settings: ReceiptSettings; banner: string | null; lang: ReceiptLang; data: ReceiptData }) {
  const lb = (k: Key) => receiptLabel(lang, k);
  const rtl = lang === "ar" || lang === "ar-en";
  const f = s.fields;
  const { date, time } = d;
  const hasLineDisc = d.lines.some((l) => (l.discount ?? 0) > 0);
  const cols = s.columns.filter((c) => c.show && (c.key !== "discount" || hasLineDisc));
  const partyLabel = lb("customer"); // bought from or sold to: one customer account
  const wordsLang: WordsLang[] = lang === "ar-en" ? ["ar", "en"] : [lang];
  const wordsAmount = d.payment ? d.payment.amount : d.total;
  const w = { A4: 210, A5: 148 }[s.paper], h = { A4: 297, A5: 210 }[s.paper];
  const unit = (u: string) => (u.toLowerCase() === "kg" ? lb("kg") : u.toLowerCase() === "pcs" ? lb("pcs") : u);
  const cell = (k: ColumnKey, l: ReceiptData["lines"][number], i: number) => {
    switch (k) {
      case "no": return i + 1;
      case "code": return l.code;
      case "name": return l.name;
      case "name2": return l.name2 ?? "";
      case "qty": return qtyFmt(l.qty);
      case "unit": return unit(l.unit);
      case "price": return fmtPrice(l.price);
      case "discount": return (l.discount ?? 0) > 0 ? `−${money(l.discount!)}${l.discountLabel ? ` (${l.discountLabel})` : ""}` : "";
      case "total": return money(l.total);
    }
  };
  const num = (k: ColumnKey) => k === "qty" || k === "price" || k === "discount" || k === "total" || k === "no";
  const info: [string, string | null | undefined, boolean?][] = [
    [lb("number"), f.number ? d.number : null, true],
    [lb("date"), f.date ? date : null, true],
    [lb("time"), f.time ? time : null, true],
    [lb("invoice"), f.invoice ? d.invoiceNo : null, true],
    [lb("order"), f.order ? d.orderNo : null, true],
    [partyLabel, f.customer ? d.party : null],
    [lb("customerCode"), f.customerCode ? d.customerCode : null, true],
    [lb("supplierRef"), d.kind === "BUY" && f.invoice ? d.supplierRef ?? null : null, true],
    [lb("delivery"), f.delivery ? d.delivery : null],
    [lb("phone"), f.phone ? d.phone : null, true],
    [lb("by"), f.by ? d.by : null],
  ];
  const border = `1px solid ${s.accent}`;

  return (
    <div className="receipt-page" dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : lang}
      style={{ width: `${w}mm`, minHeight: `${h}mm`, padding: `${s.margin}mm`, fontSize: `${s.fontSize}pt`, background: "white", color: "black", boxSizing: "border-box", display: "flex", flexDirection: "column", fontFamily: "Arial, Tahoma, sans-serif" }}>
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" style={{ width: "100%", maxHeight: `${s.bannerHeight}mm`, objectFit: "contain", display: "block", marginBottom: "3mm" }} />
      )}
      {!banner && s.showLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/bereket-logo.jpg" alt="Bereket Plastic" style={{ height: "22mm", marginBottom: "3mm" }} />
      )}
      {s.headerText && <p style={{ whiteSpace: "pre-wrap", textAlign: "center", fontSize: "0.9em", margin: "0 0 2mm" }}>{s.headerText}</p>}
      <h1 style={{ textAlign: "center", color: s.accent, fontSize: "1.6em", fontWeight: 700, margin: "1mm 0 3mm", borderBottom: `2px solid ${s.accent}`, paddingBottom: "2mm" }}>{s.title || lb(d.kind)}</h1>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4mm" }}>
        <tbody>
          {chunk(info.filter((x) => x[1]), 2).map((row, i) => (
            <tr key={i}>
              {row.map(([k, v, ltr]) => (
                <td key={k} style={{ padding: "1.2mm 2mm", width: "50%" }}>
                  <span style={{ color: "#555" }}>{k}: </span><b dir={ltr ? "ltr" : undefined}>{v}</b>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {d.payment ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4mm" }}>
          <tbody>
            {[[lb("received"), `${money(d.payment.amount)} ${d.currency}`],
              ...(d.payment.docNumber ? [[lb("forDoc"), d.payment.docNumber], [lb("docTotal"), `${money(d.payment.docTotal ?? 0)} ${d.currency}`]] : []),
              ...(d.balance && f.balance ? [[lb("prevBalance"), `${money(d.balance.before)} ${d.currency}`], [lb("newBalance"), `${money(d.balance.after)} ${d.currency}`]]
                : [...(f.paid && d.payment.docNumber ? [[lb("paidSoFar"), `${money(d.paid)} ${d.currency}`]] : []), ...(f.owed && d.payment.docNumber ? [[lb("owed"), `${money(d.owed)} ${d.currency}`]] : [])])].map(([k, v], i) => (
              <tr key={k}><td style={{ border, padding: "2mm", background: i === 0 ? `${s.accent}18` : undefined, width: "45%" }}>{k}</td><td style={{ border, padding: "2mm", fontWeight: 700, fontSize: i === 0 ? "1.3em" : undefined }} dir="ltr">{v}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "3mm" }}>
          <thead>
            <tr>{cols.map((c) => <th key={c.key} style={{ border, background: s.accent, color: "white", padding: "1.8mm 2mm", textAlign: num(c.key) ? "center" : "start", fontWeight: 600 }}>{lb(c.key)}</th>)}</tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} style={{ background: i % 2 ? "#f5f7fb" : undefined }}>
                {cols.map((c) => <td key={c.key} style={{ border, padding: "1.5mm 2mm", textAlign: num(c.key) ? "center" : "start" }} dir={num(c.key) || c.key === "code" ? "ltr" : undefined}>{cell(c.key, l, i)}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(d.discount ?? 0) > 0 && d.subtotal !== undefined && <>
              <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "1.5mm 2mm", textAlign: "end" }}>{lb("subtotal")}</td>{cols.length > 1 && <td style={{ border, padding: "1.5mm 2mm", textAlign: "center" }} dir="ltr">{money(d.subtotal)} {d.currency}</td>}</tr>
              <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "1.5mm 2mm", textAlign: "end" }}>{lb("invDiscount")}{d.discountLabel ? ` (${d.discountLabel})` : ""}</td>{cols.length > 1 && <td style={{ border, padding: "1.5mm 2mm", textAlign: "center" }} dir="ltr">−{money(d.discount!)} {d.currency}</td>}</tr>
            </>}
            <tr>
              <td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "2mm", fontWeight: 700, textAlign: "end" }}>{lb("grand")}</td>
              {cols.length > 1 && <td style={{ border, padding: "2mm", fontWeight: 700, textAlign: "center", fontSize: "1.15em" }} dir="ltr">{money(d.total)} {d.currency}</td>}
            </tr>
            {d.balance && f.balance ? <>
              {/* Customer account: what was owed before, this invoice, paid now, and what is owed now (− = customer owes) */}
              <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "1.5mm 2mm", textAlign: "end" }}>{lb("prevBalance")}</td>{cols.length > 1 && <td style={{ border, padding: "1.5mm 2mm", textAlign: "center" }} dir="ltr">{money(d.balance.before)} {d.currency}</td>}</tr>
              {f.paid && <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "1.5mm 2mm", textAlign: "end" }}>{lb("paidNow")}</td>{cols.length > 1 && <td style={{ border, padding: "1.5mm 2mm", textAlign: "center" }} dir="ltr">{money(d.balance.paidNow)} {d.currency}</td>}</tr>}
              <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "2mm", fontWeight: 700, textAlign: "end" }}>{lb("newBalance")} <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#555" }}>{lb("signHint")}</span></td>{cols.length > 1 && <td style={{ border, padding: "2mm", textAlign: "center", fontWeight: 700, fontSize: "1.1em", color: d.balance.after < 0 ? "#b91c1c" : undefined }} dir="ltr" data-testid="receipt-new-balance">{money(d.balance.after)} {d.currency}</td>}</tr>
            </> : <>
            {f.paid && <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "1.5mm 2mm", textAlign: "end" }}>{lb("paid")}</td>{cols.length > 1 && <td style={{ border, padding: "1.5mm 2mm", textAlign: "center" }} dir="ltr">{money(d.paid)} {d.currency}</td>}</tr>}
            {f.owed && <tr><td colSpan={Math.max(cols.length - 1, 1)} style={{ border, padding: "1.5mm 2mm", textAlign: "end" }}>{lb("owed")}</td>{cols.length > 1 && <td style={{ border, padding: "1.5mm 2mm", textAlign: "center", fontWeight: 700 }} dir="ltr">{money(d.owed)} {d.currency}</td>}</tr>}
            </>}
          </tfoot>
        </table>
      )}

      {f.words && wordsLang.map((wl) => <p key={wl} dir={wl === "ar" ? "rtl" : "ltr"} style={{ margin: "1mm 0", padding: "2mm", background: "#f5f7fb", borderInlineStart: `3px solid ${s.accent}` }}>{amountInWords(wordsAmount, d.currency, wl)}</p>)}
      {f.note && d.note && <p style={{ marginTop: "2mm", whiteSpace: "pre-wrap" }}><span style={{ color: "#555" }}>{lb("note")}: </span>{d.note}</p>}

      <div style={{ flex: 1 }} />
      {f.signatures && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: "20mm", marginTop: "6mm" }}>
          {[s.signatures[0] || lb("sign1"), s.signatures[1] || lb("sign2")].map((x) => (
            <div key={x} style={{ flex: 1, textAlign: "center" }}><div style={{ height: "16mm" }} /><div style={{ borderTop: "1px solid #333", paddingTop: "1.5mm" }}>{x}</div></div>
          ))}
        </div>
      )}
      {s.footerText && <p style={{ whiteSpace: "pre-wrap", textAlign: "center", fontSize: "0.85em", color: "#444", borderTop: `1px solid ${s.accent}`, paddingTop: "2mm", marginTop: "4mm" }}>{s.footerText}</p>}
    </div>
  );
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
