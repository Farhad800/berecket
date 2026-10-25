/**
 * Amounts in words for receipts: Arabic, English, Turkish.
 * e.g. 2,500,000 IQD → "فقط مليونان وخمسمائة ألف دينار عراقي لا غير".
 * Pure functions (used in the browser preview and on the server).
 */
export type WordsLang = "ar" | "en" | "tr";
export type WordsCur = "IQD" | "USD" | "EUR";

// ───────────────────────────── Arabic
const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة",
  "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
// [one, two, 3–10 (plural), 11+]
const AR_SCALES: [string, string, string, string][] = [
  ["", "", "", ""],
  ["ألف", "ألفان", "آلاف", "ألف"],
  ["مليون", "مليونان", "ملايين", "مليون"],
  ["مليار", "ملياران", "مليارات", "مليار"],
];
function ar999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(AR_HUNDREDS[h]);
  if (r) {
    if (r < 20) parts.push(AR_ONES[r]);
    else { const o = r % 10, t = Math.floor(r / 10); parts.push(o ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t]); }
  }
  return parts.join(" و");
}
function arInt(n: number): string {
  if (n === 0) return "صفر";
  const groups: string[] = [];
  for (let s = 0; n > 0; s++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (!g) continue;
    if (s === 0) { groups.unshift(ar999(g)); continue; }
    const [one, two, few, many] = AR_SCALES[s];
    groups.unshift(g === 1 ? one : g === 2 ? two : g <= 10 ? `${ar999(g)} ${few}` : `${ar999(g)} ${many}`);
  }
  return groups.join(" و");
}

// ───────────────────────────── English
const EN_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["", "thousand", "million", "billion"];
function en999(n: number) {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(`${EN_ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? EN_ONES[r] : EN_TENS[Math.floor(r / 10)] + (r % 10 ? `-${EN_ONES[r % 10]}` : ""));
  return parts.join(" and ");
}
function enInt(n: number) {
  if (n === 0) return "zero";
  const g: string[] = [];
  for (let s = 0; n > 0; s++, n = Math.floor(n / 1000)) if (n % 1000) g.unshift(en999(n % 1000) + (EN_SCALES[s] ? ` ${EN_SCALES[s]}` : ""));
  return g.join(" ");
}

// ───────────────────────────── Turkish
const TR_ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TR_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const TR_SCALES = ["", "bin", "milyon", "milyar"];
function tr999(n: number) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10, parts: string[] = [];
  if (h) parts.push(h === 1 ? "yüz" : `${TR_ONES[h]} yüz`);
  if (t) parts.push(TR_TENS[t]);
  if (o) parts.push(TR_ONES[o]);
  return parts.join(" ");
}
function trInt(n: number) {
  if (n === 0) return "sıfır";
  const g: string[] = [];
  for (let s = 0; n > 0; s++, n = Math.floor(n / 1000)) {
    const v = n % 1000;
    if (!v) continue;
    g.unshift(s === 1 && v === 1 ? "bin" : `${tr999(v)}${TR_SCALES[s] ? ` ${TR_SCALES[s]}` : ""}`);
  }
  return g.join(" ");
}

const CUR: Record<WordsLang, Record<WordsCur, [string, string]>> = {
  ar: { IQD: ["دينار عراقي", "فلس"], USD: ["دولار أمريكي", "سنت"], EUR: ["يورو", "سنت"] },
  en: { IQD: ["Iraqi dinars", "fils"], USD: ["US dollars", "cents"], EUR: ["euros", "cents"] },
  tr: { IQD: ["Irak dinarı", "fils"], USD: ["ABD doları", "sent"], EUR: ["avro", "sent"] },
};

/** Whole amount + fraction (2 decimals) in words, with the currency name. */
export function amountInWords(amount: number, currency: WordsCur, lang: WordsLang): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100), frac = cents % 100;
  const [main, sub] = CUR[lang][currency];
  if (lang === "ar") return `فقط ${arInt(whole)} ${main}${frac ? ` و${arInt(frac)} ${sub}` : ""} لا غير`;
  if (lang === "tr") return `Yalnız ${trInt(whole)} ${main}${frac ? ` ${trInt(frac)} ${sub}` : ""}`;
  const s = `${enInt(whole)} ${main}${frac ? ` and ${enInt(frac)} ${sub}` : ""} only`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
