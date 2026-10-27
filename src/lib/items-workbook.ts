import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { getStock } from "./stock";
import { nextNumber } from "./numbering";
import { round6 } from "./money";

/**
 * The accountant's items workbook (27 Oct 2026). Download: every label, raw material, packaging item and
 * product already in the system, with what is known about it, its cost and its stock. The accountant fills
 * in or corrects the rest — and new rows — and uploads it back. Rows are matched on their code.
 * Empty cells never delete anything. "Counted stock" sets the stock to that number with one Input and/or
 * one Output count document (the difference to what the system has at the moment of the upload).
 */
export type SheetId = "STICKER" | "MATERIAL" | "PACKAGING" | "PRODUCT" | "RECIPE";
type Col = { key: string; en: string; ar: string; info?: boolean; width?: number; required?: boolean };

const SUPPLY_COLS: Col[] = [
  { key: "code", en: "Code", ar: "الرمز", width: 14 },
  { key: "name", en: "Name", ar: "الاسم", required: true, width: 34 },
  { key: "name2", en: "Second name", ar: "الاسم الثاني", width: 24 },
  { key: "unit", en: "Unit (pcs/kg)", ar: "الوحدة", width: 12 },
  { key: "bag", en: "Weight of one bag (kg)", ar: "وزن الكيس الواحد", width: 16 },
  { key: "price", en: "Cost price", ar: "سعر التكلفة", width: 13 },
  { key: "currency", en: "Currency (IQD/USD/EUR)", ar: "العملة", width: 14 },
  { key: "rate", en: "Rate to IQD", ar: "سعر الصرف إلى الدينار", width: 14 },
  { key: "costIqd", en: "Cost in IQD (calculated)", ar: "التكلفة بالدينار (محسوبة)", info: true, width: 16 },
  { key: "stockNow", en: "In stock now (system)", ar: "الموجود حالياً في النظام", info: true, width: 16 },
  { key: "counted", en: "Counted stock", ar: "الجرد الفعلي", width: 14 },
];
const PRODUCT_COLS: Col[] = [
  { key: "code", en: "Product code", ar: "رمز المنتج", width: 16 },
  { key: "name", en: "Name", ar: "الاسم", required: true, width: 34 },
  { key: "name2", en: "Second name", ar: "الاسم الثاني", width: 24 },
  { key: "mold", en: "Mold code", ar: "رمز القالب", width: 14 },
  { key: "label", en: "Label code", ar: "رمز الملصق", width: 14 },
  { key: "qc", en: "QC required (yes/no)", ar: "فحص الجودة", width: 12 },
  { key: "stockNow", en: "In stock now (system)", ar: "الموجود حالياً في النظام", info: true, width: 16 },
  { key: "counted", en: "Counted stock", ar: "الجرد الفعلي", width: 14 },
];
const RECIPE_COLS: Col[] = [
  { key: "product", en: "Product code", ar: "رمز المنتج", required: true, width: 16 },
  { key: "productName", en: "Product name", ar: "اسم المنتج", info: true, width: 30 },
  { key: "item", en: "Item code", ar: "رمز المادة", required: true, width: 14 },
  { key: "itemName", en: "Item name", ar: "اسم المادة", info: true, width: 30 },
  { key: "qty", en: "Quantity", ar: "الكمية", required: true, width: 12 },
  { key: "per", en: "Per (piece/pack)", ar: "لكل (قطعة/عبوة)", required: true, width: 14 },
];
export const SHEETS: { id: SheetId; title: string; cols: Col[] }[] = [
  { id: "STICKER", title: "Labels", cols: SUPPLY_COLS },
  { id: "MATERIAL", title: "Raw materials", cols: SUPPLY_COLS },
  { id: "PACKAGING", title: "Packaging", cols: SUPPLY_COLS },
  { id: "PRODUCT", title: "Products", cols: PRODUCT_COLS },
  { id: "RECIPE", title: "Made of & packaging", cols: RECIPE_COLS },
];
const header = (c: Col) => `${c.en}${c.required ? " *" : ""} · ${c.ar}`;
const norm = (s: string) => s.split("·")[0].replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const letter = (i: number) => String.fromCharCode(65 + i);
const AUTO = { STICKER: "itemLabel", MATERIAL: "itemMaterial", PACKAGING: "itemPackaging" } as const;
const CODE_RE = /^[A-Za-z0-9._\-/]{1,40}$/;
const isKg = (u: string) => u.toLowerCase() === "kg";

// ───────────────────────────── download
export async function buildItemsWorkbook(withCost: boolean) {
  const [items, stock] = await Promise.all([
    db.product.findMany({
      where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { code: "asc" }],
      select: { id: true, code: true, kind: true, name: true, name2: true, unit: true, unitWeightKg: true, qcRequired: true, costPrice: true, costCurrency: true, costRate: true,
        mold: { select: { code: true } }, label: { select: { code: true } },
        components: { orderBy: { createdAt: "asc" }, select: { qty: true, per: true, component: { select: { code: true, name: true } } } } },
    }),
    getStock(),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bereket Plastic FMS";
  const help = wb.addWorksheet("How to use");
  help.columns = [{ width: 120 }];
  [
    "Bereket Plastic — items workbook (labels, raw materials, packaging, products)",
    "",
    "1. This file already lists every item in the system. Fill in what is missing or wrong, and add new items in new rows at the bottom of their sheet.",
    "2. Each row is matched on its Code. Leave the Code empty on a new label / raw material / packaging row and the system gives one (LBL-0001, MAT-0001, PKG-0001). A new product needs a Product code, or a Mold code (it then gets MOLDCODE-001 …).",
    "3. Empty cells never delete anything. Grey columns are for information only and are not read back.",
    "4. Cost: price of ONE unit (1 piece or 1 kg) + its currency. For USD or EUR also type today's rate (1 USD = how many IQD). Product costs are always worked out in IQD.",
    "5. Weight of one bag: only for packaging stocked in kg but used by the bag (nylon).",
    "6. Counted stock: what is really on the shelf now. The system sets the stock to this number and records the difference as one count document. Leave it empty to keep the stock as it is.",
    "7. Made of & packaging: one row per item a product uses. Per = piece → amount for ONE piece (grams for kg items, pieces for others). Per = pack → how many products go into ONE carton / bag. A product listed on this sheet gets exactly the rows listed (its old rows are replaced).",
    "8. Upload: Products → Import from Excel → Items workbook → choose the file → Check file → Save.",
    "",
    "١. هذا الملف يحتوي على كل المواد الموجودة في النظام. أكمل الناقص أو صحّح الخطأ، وأضف المواد الجديدة في صفوف جديدة أسفل ورقتها.",
    "٢. كل صف يُطابَق برمزه. اترك الرمز فارغاً للمادة الجديدة وسيُعطى رمز تلقائي. المنتج الجديد يحتاج رمز منتج أو رمز قالب.",
    "٣. الخلايا الفارغة لا تحذف شيئاً. الأعمدة الرمادية للمعلومات فقط ولا تُقرأ.",
    "٤. التكلفة: سعر الوحدة الواحدة (قطعة أو كيلو) مع العملة. للدولار أو اليورو اكتب سعر الصرف اليوم. تكلفة المنتجات تُحسب دائماً بالدينار.",
    "٥. الجرد الفعلي: الكمية الموجودة فعلاً على الرف. النظام يجعل المخزون مساوياً لها ويسجّل الفرق في مستند جرد. اتركه فارغاً لإبقاء المخزون كما هو.",
    "٦. المكونات والتغليف: صف لكل مادة يستعملها المنتج. لكل قطعة = الكمية لقطعة واحدة (غرام لمواد الكيلو). لكل عبوة = كم منتج يدخل في كرتون / كيس واحد.",
  ].forEach((l, i) => { const r = help.addRow([l]); r.alignment = { wrapText: true }; if (i === 0) r.font = { bold: true, size: 14 }; });

  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  for (const sh of SHEETS) {
    const cols = sh.cols.filter((c) => withCost || !["price", "currency", "rate", "costIqd"].includes(c.key));
    const ws = wb.addWorksheet(sh.title, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: header(c), key: c.key, width: c.width ?? 16 }));
    const head = ws.getRow(1);
    head.height = 32; head.alignment = { wrapText: true, vertical: "middle" };
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.info ? "FF6B7280" : "FF294680" } };
    });
    const col = (k: string) => cols.findIndex((c) => c.key === k);
    const rows: Record<string, unknown>[] = [];
    if (sh.id === "RECIPE") {
      for (const p of items.filter((x) => x.kind === "PRODUCT")) for (const l of p.components)
        rows.push({ product: p.code, productName: p.name, item: l.component.code, itemName: l.component.name, qty: Number(l.qty), per: l.per === "PIECE" ? "piece" : "pack" });
    } else {
      for (const it of items.filter((x) => x.kind === sh.id)) {
        rows.push(sh.id === "PRODUCT"
          ? { code: it.code, name: it.name, name2: it.name2, mold: it.mold?.code ?? null, label: it.label?.code ?? null, qc: it.qcRequired ? "yes" : "no", stockNow: stock.get(it.id) ?? 0 }
          : { code: it.code, name: it.name, name2: it.name2, unit: it.unit, bag: n(it.unitWeightKg), price: n(it.costPrice), currency: it.costPrice === null ? null : it.costCurrency, rate: it.costPrice === null || it.costCurrency === "IQD" ? null : n(it.costRate), stockNow: stock.get(it.id) ?? 0 });
      }
    }
    rows.forEach((r) => ws.addRow(r));
    const last = Math.max(rows.length + 300, 500); // room for new rows: drop-downs and the cost formula reach them
    for (let r = 2; r <= last; r++) {
      const row = ws.getRow(r);
      cols.forEach((c, i) => { if (c.info) row.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F6" } }; });
      if (col("costIqd") >= 0) {
        const p = `${letter(col("price"))}${r}`, cur = `${letter(col("currency"))}${r}`, rt = `${letter(col("rate"))}${r}`;
        row.getCell(col("costIqd") + 1).value = { formula: `IF(${p}="","",IF(OR(${cur}="",${cur}="IQD"),${p},IF(${rt}="","rate?",${p}*${rt})))` };
      }
    }
    const list = (k: string, values: string[]) => {
      const i = col(k);
      if (i < 0) return;
      for (let r = 2; r <= last; r++) ws.getRow(r).getCell(i + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`], showErrorMessage: true, errorTitle: "Bereket", error: `Choose: ${values.join(" / ")}` };
    };
    list("unit", ["pcs", "kg"]); list("currency", ["IQD", "USD", "EUR"]); list("qc", ["yes", "no"]); list("per", ["piece", "pack"]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────────────────────── reading
export type RowError = { sheet: SheetId; row: number; message: string };
type Raw = { row: number; v: Record<string, string> };

export async function readItemsWorkbook(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new Error("BAD_FILE"); }
  const out: Partial<Record<SheetId, Raw[]>> = {};
  const errors: RowError[] = [];
  for (const sh of SHEETS) {
    const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === sh.title.toLowerCase());
    if (!ws) continue;
    const head: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = String(c.text ?? ""); });
    const idx: Record<string, number> = {};
    head.forEach((h, i) => { const c = sh.cols.find((x) => norm(x.en) === norm(h ?? "")); if (c && !c.info && idx[c.key] === undefined) idx[c.key] = i; });
    const missing = sh.cols.filter((c) => c.required && idx[c.key] === undefined);
    if (missing.length) { errors.push({ sheet: sh.id, row: 1, message: `Missing column: ${missing.map((m) => m.en).join(", ")}` }); continue; }
    const rows: Raw[] = [];
    ws.eachRow({ includeEmpty: false }, (r, rn) => {
      if (rn === 1) return;
      const v: Record<string, string> = {};
      for (const [k, i] of Object.entries(idx)) {
        const c = r.getCell(i), val = c.value as unknown;
        const raw = typeof val === "number" ? val : val && typeof val === "object" && "result" in (val as object) ? (val as { result: unknown }).result : c.text;
        v[k] = String(raw ?? "").trim();
      }
      if (Object.values(v).every((x) => !x)) return;
      rows.push({ row: rn, v });
    });
    if (rows.length > 12000) errors.push({ sheet: sh.id, row: 1, message: "More than 12,000 rows — split the file." });
    out[sh.id] = rows;
  }
  if (!Object.keys(out).length && !errors.length) throw new Error("NO_SHEETS");
  return { sheets: out, errors };
}

// ───────────────────────────── checking + saving
export type ItemsPlan = {
  counts: Record<SheetId, { create: number; update: number; same: number }>;
  costs: number;
  stockUp: number;
  stockDown: number;
  errors: RowError[];
  docs?: { input?: string; output?: string };
};
type Opts = { withCost: boolean; canInput: boolean; canOutput: boolean; userId: string; file: string };

/** "1,250.5" and "1250,5" both read as numbers (thousands commas or a decimal comma). */
const num = (s: string) => (s === "" ? undefined : Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".")));
const dec = (n: number, d: number) => Math.abs(n * 10 ** d - Math.round(n * 10 ** d)) < 1e-6 * Math.max(1, Math.abs(n * 10 ** d) / 1e6);
const yes = (s: string) => /^(y|yes|true|1|x|✓|نعم|evet|e)$/i.test(s.trim());
const no = (s: string) => /^(n|no|false|0|لا|hayır|hayir|h)$/i.test(s.trim());
const UNIT: Record<string, "pcs" | "kg"> = { pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", عدد: "pcs", قطعة: "pcs", adet: "pcs", kg: "kg", كغم: "kg", كيلو: "kg" };

export async function planItems(sheets: Partial<Record<SheetId, Raw[]>>, pre: RowError[], o: Opts, tx?: Prisma.TransactionClient): Promise<ItemsPlan> {
  const c: Tx = tx ?? db;
  const errors = [...pre];
  const err = (sheet: SheetId, row: number, message: string) => { if (errors.length < 500) errors.push({ sheet, row, message }); };
  const counts = Object.fromEntries(SHEETS.map((s) => [s.id, { create: 0, update: 0, same: 0 }])) as ItemsPlan["counts"];
  const all = await c.product.findMany({ select: { id: true, code: true, kind: true, name: true, name2: true, unit: true, unitWeightKg: true, qcRequired: true, moldId: true, labelId: true, archivedAt: true, costPrice: true, costCurrency: true, costRate: true } });
  const byCode = new Map(all.map((p) => [p.code, p]));
  const molds = new Map((await c.mold.findMany({ select: { id: true, code: true } })).map((m) => [m.code, m.id]));
  const kindOf = new Map(all.map((p) => [p.code, p.kind as string]));
  const seenCodes = new Set<string>();

  type ItemRow = { sheet: SheetId; row: number; code?: string; existing?: (typeof all)[number]; data: Record<string, unknown>; cost?: { costPrice: number; costCurrency: "IQD" | "USD" | "EUR"; costRate: number; costIqd: number }; counted?: number; mold?: string; label?: string };
  const rows: ItemRow[] = [];
  const namesTaken = new Map<string, Set<string>>(); // kind → lower names (active), to refuse duplicates
  for (const p of all) if (!p.archivedAt) { const s = namesTaken.get(p.kind) ?? new Set(); s.add(p.name.toLowerCase()); namesTaken.set(p.kind, s); }

  for (const sh of SHEETS.filter((s) => s.id !== "RECIPE")) {
    for (const { row, v } of sheets[sh.id] ?? []) {
      const code = v.code ? v.code.toUpperCase() : undefined;
      if (code && !CODE_RE.test(code)) { err(sh.id, row, `"${v.code}" can't be a code (letters, numbers, - _ . / only, up to 40).`); continue; }
      if (code && seenCodes.has(code)) { err(sh.id, row, `${code} appears twice in the file.`); continue; }
      // A row without a code is the item of the same name in this section (on that mold, for products), if there is one.
      const existing = code ? byCode.get(code)
        : all.find((x) => x.kind === sh.id && !x.archivedAt && x.name.toLowerCase() === (v.name ?? "").toLowerCase() && (sh.id !== "PRODUCT" || (v.mold && x.moldId === molds.get(v.mold.toUpperCase()))));
      const rowCode = code ?? existing?.code;
      if (existing && existing.kind !== sh.id) { err(sh.id, row, `${code} is already used for another kind of item (${existing.kind.toLowerCase()}).`); continue; }
      if (!v.name) { err(sh.id, row, "Name is required."); continue; }
      if (v.name.length > 160 || (v.name2 ?? "").length > 160) { err(sh.id, row, "A name is longer than 160 characters."); continue; }
      if (sh.id !== "PRODUCT" && (!existing || existing.name.toLowerCase() !== v.name.toLowerCase())) {
        const taken = namesTaken.get(sh.id) ?? new Set();
        if (taken.has(v.name.toLowerCase())) { err(sh.id, row, `"${v.name}" already exists in this section.`); continue; }
        taken.add(v.name.toLowerCase()); namesTaken.set(sh.id, taken);
      }
      if (!code && rowCode && seenCodes.has(rowCode)) { err(sh.id, row, `${rowCode} appears twice in the file.`); continue; }
      if (rowCode) { seenCodes.add(rowCode); kindOf.set(rowCode, sh.id); }
      const r: ItemRow = { sheet: sh.id, row, code: rowCode, existing, data: { name: v.name, ...(v.name2 ? { name2: v.name2 } : {}) } };
      let unit = existing?.unit ?? (sh.id === "MATERIAL" ? "kg" : "pcs");
      if (sh.id !== "PRODUCT") {
        if (v.unit) { const u = UNIT[v.unit.toLowerCase()]; if (!u) { err(sh.id, row, `Unit must be pcs or kg (not "${v.unit}").`); continue; } unit = u; r.data.unit = u; }
        else if (!existing) r.data.unit = unit;
        if (v.bag) { const b = num(v.bag); if (b === undefined || !(b > 0) || b > 1000) { err(sh.id, row, "Weight of one bag must be a number of kg above 0."); continue; } r.data.unitWeightKg = b; }
        if (v.price) {
          if (!o.withCost) { err(sh.id, row, "You don't have permission to set costs (Buy, Sell or Safe)."); continue; }
          const p = num(v.price), cur = (v.currency || "IQD").toUpperCase(), rt = cur === "IQD" ? 1 : num(v.rate ?? "");
          if (p === undefined || Number.isNaN(p) || p < 0 || !dec(p, 6)) { err(sh.id, row, "Cost price must be a number (at most 6 decimals)."); continue; }
          if (!["IQD", "USD", "EUR"].includes(cur)) { err(sh.id, row, `Currency must be IQD, USD or EUR (not "${v.currency}").`); continue; }
          if (rt === undefined || Number.isNaN(rt) || !(rt > 0) || !dec(rt, 6)) { err(sh.id, row, `Type the rate: 1 ${cur} = how many IQD?`); continue; }
          r.cost = { costPrice: p, costCurrency: cur as "IQD" | "USD" | "EUR", costRate: rt, costIqd: round6(p * rt) };
        }
      } else {
        if (v.mold) { const m = v.mold.toUpperCase(); if (!molds.has(m)) { err(sh.id, row, `Mold ${m} doesn't exist. Add it first (Machines & Molds).`); continue; } r.mold = m; }
        if (!code && !r.mold) { err(sh.id, row, "A new product needs a Product code or a Mold code."); continue; }
        if (v.label) r.label = v.label.toUpperCase();
        if (v.qc) { if (!yes(v.qc) && !no(v.qc)) { err(sh.id, row, `QC required must be yes or no (not "${v.qc}").`); continue; } r.data.qcRequired = yes(v.qc); }
      }
      if (v.counted) {
        const q = num(v.counted);
        if (q === undefined || Number.isNaN(q) || q < 0) { err(sh.id, row, "Counted stock must be 0 or more."); continue; }
        if (isKg(String(r.data.unit ?? unit)) ? !dec(q, 3) : !Number.isInteger(q)) { err(sh.id, row, isKg(String(r.data.unit ?? unit)) ? "Counted kg can have at most 3 decimals." : "Counted pieces must be a whole number."); continue; }
        r.counted = q;
      }
      rows.push(r);
    }
  }
  // labels on products must be labels (in the system or on the Labels sheet)
  for (const r of rows) if (r.label && kindOf.get(r.label) !== "STICKER") err("PRODUCT", r.row, `Label ${r.label} isn't a label in the system or on the Labels sheet.`);

  // recipes
  const recipe = new Map<string, { item: string; qty: number; per: "PIECE" | "CARTON"; row: number }[]>();
  const labelFor = new Map<string, { item: string; row: number }>(); // a label listed under a product = that product's label
  for (const { row, v } of sheets.RECIPE ?? []) {
    if (!v.item && !v.qty) continue; // an empty row left in a product's block
    const product = v.product.toUpperCase(), item = v.item.toUpperCase();
    if (!item) { err("RECIPE", row, "Choose the item (its code is missing)."); continue; }
    const qty = num(v.qty ?? ""), per = /^(pack|c|carton|cartons|nylon|bag|عبوة|كارتون|نايلون|كيس|koli|naylon|torba|paket)/i.test(v.per) ? "CARTON" : /^(p|piece|pieces|pcs|قطعة|عدد|adet)/i.test(v.per) ? "PIECE" : null;
    if (kindOf.get(product) !== "PRODUCT") { err("RECIPE", row, `${product} isn't a product in the system or on the Products sheet.`); continue; }
    if (!kindOf.has(item)) { err("RECIPE", row, `Item ${item} doesn't exist (give it a Code on its sheet first).`); continue; }
    if (item === product) { err("RECIPE", row, "A product can't be made of itself."); continue; }
    if (kindOf.get(item) === "STICKER") {
      const had = labelFor.get(product);
      if (had && had.item !== item) { err("RECIPE", row, `${product} has two labels (${had.item} and ${item}). A product has one label.`); continue; }
      labelFor.set(product, { item, row }); continue;
    }
    if (qty === undefined || Number.isNaN(qty) || qty <= 0 || !dec(qty, 4)) { err("RECIPE", row, "Quantity must be more than 0 (at most 4 decimals)."); continue; }
    if (!per) { err("RECIPE", row, `Per must be piece or pack (not "${v.per}").`); continue; }
    if (per === "CARTON" && kindOf.get(item) !== "PACKAGING") { err("RECIPE", row, `${item} isn't packaging — use "piece" for materials.`); continue; }
    const lines = recipe.get(product) ?? [];
    if (lines.some((l) => l.item === item && l.per === per)) { err("RECIPE", row, `${item} is listed twice for ${product}.`); continue; }
    lines.push({ item, qty, per, row }); recipe.set(product, lines);
  }

  // a label chosen in a product's block wins over the Products sheet's Label code
  for (const r of rows) if (r.sheet === "PRODUCT" && r.code && labelFor.has(r.code)) r.label = undefined;

  // what would change
  const changed = (e: Record<string, unknown>, d: Record<string, unknown>) => Object.entries(d).some(([k, val]) => String(e[k] ?? "") !== String(val ?? ""));
  let costs = 0;
  for (const r of rows) {
    const e = r.existing;
    const moldChange = r.mold && e && molds.get(r.mold) !== e.moldId;
    const labelChange = r.label && e && all.find((x) => x.id === e.labelId)?.code !== r.label;
    const costChange = r.cost && (!e || Number(e.costPrice) !== r.cost.costPrice || e.costCurrency !== r.cost.costCurrency || Number(e.costRate) !== r.cost.costRate || e.costPrice === null);
    if (costChange) costs++;
    counts[r.sheet][!e ? "create" : changed(e as unknown as Record<string, unknown>, r.data) || moldChange || labelChange || costChange ? "update" : "same"]++;
  }
  const curRecipes = await c.productComponent.findMany({ where: { product: { code: { in: [...recipe.keys()] } } }, select: { qty: true, per: true, product: { select: { code: true } }, component: { select: { code: true } } } });
  const codeOfId = new Map(all.map((x) => [x.id, x.code]));
  const labelChanges = [...labelFor].filter(([prod, l]) => { const e = byCode.get(prod); return !e || codeOfId.get(e.labelId ?? "") !== l.item; });
  for (const [prod] of labelChanges) if (!recipe.has(prod)) counts.RECIPE[byCode.has(prod) ? "update" : "create"]++;
  for (const [prod, lines] of recipe) {
    const cur = curRecipes.filter((x) => x.product.code === prod).map((x) => `${x.component.code}|${Number(x.qty)}|${x.per}`).sort().join(";");
    const next = lines.map((l) => `${l.item}|${l.qty}|${l.per}`).sort().join(";");
    counts.RECIPE[cur === next && !labelChanges.some(([p]) => p === prod) ? "same" : cur ? "update" : "create"]++;
  }
  // stock counts: difference to the stock right now
  const countedRows = rows.filter((r) => r.counted !== undefined);
  const stock = await getStock(countedRows.filter((r) => r.existing).map((r) => r.existing!.id), c);
  let stockUp = 0, stockDown = 0;
  for (const r of countedRows) {
    const d = r.counted! - (r.existing ? stock.get(r.existing.id) ?? 0 : 0);
    if (d > 1e-9) stockUp++; else if (d < -1e-9) stockDown++;
  }
  if (stockUp && !o.canInput) err("PRODUCT", 1, "Counted stock adds to some items, but you don't have permission for Stock Movements → Input.");
  if (stockDown && !o.canOutput) err("PRODUCT", 1, "Counted stock takes from some items, but you don't have permission for Stock Movements → Output.");
  const plan: ItemsPlan = { counts, costs, stockUp, stockDown, errors };
  if (!tx || errors.length) return plan;

  // ── save (inside the caller's transaction)
  const ids = new Map(all.map((p) => [p.code, p.id]));
  const now = new Date();
  // automatic MOLDCODE-001 codes for new products without a code
  const taken = new Set([...byCode.keys(), ...seenCodes]);
  const seq = new Map<string, number>();
  const moldCode = (m: string) => { let n = seq.get(m) ?? 0, code: string; do code = `${m}-${String(++n).padStart(3, "0")}`; while (taken.has(code)); seq.set(m, n); taken.add(code); return code; };
  for (const r of rows) {
    const data: Prisma.ProductUncheckedUpdateInput = { ...r.data, ...(r.mold ? { moldId: molds.get(r.mold)! } : {}), ...(r.cost ? { ...r.cost, costUpdatedAt: now } : {}) };
    if (r.existing) {
      await tx.product.update({ where: { id: r.existing.id }, data });
      if (r.existing.archivedAt) await tx.product.update({ where: { id: r.existing.id }, data: { archivedAt: null } });
    } else {
      let code = r.code;
      if (!code) {
        if (r.sheet === "PRODUCT") code = moldCode(r.mold!);
        else { do code = await nextNumber(AUTO[r.sheet as keyof typeof AUTO], tx); while (taken.has(code)); taken.add(code); }
        r.code = code;
      }
      const p = await tx.product.create({ data: { ...(data as Prisma.ProductUncheckedCreateInput), code, kind: r.sheet as "PRODUCT", name: String(r.data.name) } });
      ids.set(code, p.id);
    }
  }
  for (const r of rows) if (r.label) await tx.product.update({ where: { id: ids.get(r.code!)! }, data: { labelId: ids.get(r.label)! } });
  for (const [prod, l] of labelFor) await tx.product.update({ where: { id: ids.get(prod)! }, data: { labelId: ids.get(l.item)! } });
  for (const [prod, lines] of recipe) {
    const pid = ids.get(prod)!;
    await tx.productComponent.deleteMany({ where: { productId: pid } }); // the sheet gives the product's whole "made of & packaging"
    await tx.productComponent.createMany({ data: lines.map((l) => ({ productId: pid, componentId: ids.get(l.item)!, qty: l.qty, per: l.per })) });
  }
  // one Input and/or one Output count document for the differences
  const fresh = await getStock(countedRows.map((r) => ids.get(r.code!)!), tx);
  const diffs = countedRows.map((r) => ({ id: ids.get(r.code!)!, code: r.code!, d: Math.round((r.counted! - (fresh.get(ids.get(r.code!)!) ?? 0)) * 1000) / 1000 })).filter((x) => x.d !== 0);
  const docs: ItemsPlan["docs"] = {};
  for (const type of ["INPUT", "OUTPUT"] as const) {
    const lines = diffs.filter((x) => (type === "INPUT" ? x.d > 0 : x.d < 0));
    if (!lines.length) continue;
    const number = await nextNumber(type === "INPUT" ? "stockInput" : "stockOutput", tx);
    const note = `Stock count from Excel (${o.file})`;
    const doc = await tx.stockDoc.create({ data: { number, type, reason: "COUNT", note, createdById: o.userId } });
    await tx.stockMovement.createMany({ data: lines.map((l) => ({ productId: l.id, type, qty: l.d, docId: doc.id, reference: number, reason: note, createdById: o.userId })) });
    docs[type === "INPUT" ? "input" : "output"] = number;
  }
  plan.docs = docs;
  return plan;
}
