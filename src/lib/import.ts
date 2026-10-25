import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Bulk import of master data from the Excel template (or a CSV with the same headings).
 * Three sheets: Machines, Molds, Products. Rows are matched on their code: a new code is
 * created, an existing code is updated (empty cells never wipe existing values).
 * Nothing is saved unless the whole file is valid.
 */

export type SheetKey = "machines" | "molds" | "products" | "recipes";
type Col = { key: string; title: string; aliases: string[]; required?: boolean; example: (string | number)[] };

export const SHEETS: Record<SheetKey, { title: string; cols: Col[] }> = {
  machines: {
    title: "Machines",
    cols: [
      { key: "code", title: "Machine code", aliases: ["machine code", "machine", "code"], required: true, example: ["M-01", "M-02"] },
      { key: "name", title: "Name", aliases: ["name", "machine name"], required: true, example: ["Toyo Si-180", "Toyo Si-250"] },
      { key: "manufacturer", title: "Manufacturer", aliases: ["manufacturer", "brand"], example: ["Toyo", "Toyo"] },
      { key: "model", title: "Model", aliases: ["model"], example: ["Si-180", "Si-250"] },
      { key: "tonnage", title: "Tonnage", aliases: ["tonnage", "tons", "ton"], example: [180, 250] },
    ],
  },
  molds: {
    title: "Molds",
    cols: [
      { key: "code", title: "Mold code", aliases: ["mold code", "mould code", "mold", "mould", "code"], required: true, example: ["MD-CAP28", "MD-PF500"] },
      { key: "name", title: "Name", aliases: ["name", "mold name", "mould name"], required: true, example: ["28 mm cap, 24 cavities", "500 ml preform"] },
      { key: "cavities", title: "Cavities", aliases: ["cavities", "cavity"], example: [24, 32] },
      { key: "machine", title: "Mounted on machine", aliases: ["mounted on machine", "machine", "machine code"], example: ["M-01", ""] },
      { key: "notes", title: "Notes", aliases: ["notes", "note"], example: ["", ""] },
    ],
  },
  products: {
    title: "Products",
    cols: [
      { key: "mold", title: "Mold code", aliases: ["mold code", "mould code", "mold", "mould"], example: ["MD-CAP28", "MD-CAP28"] },
      { key: "code", title: "Product code", aliases: ["product code", "code", "item code"], example: ["", "CAP28-ZAKHO"] },
      { key: "name", title: "Label / product name", aliases: ["label / product name", "label", "product name", "name", "product", "arabic name"], required: true, example: ["Zakho Water cap blue", "Duhok Juice cap red"] },
      { key: "material", title: "Material", aliases: ["material"], example: ["PP", "PP"] },
      { key: "color", title: "Color", aliases: ["color", "colour"], example: ["Blue", "Red"] },
      { key: "weightGrams", title: "Weight (g)", aliases: ["weight (g)", "weight", "grams"], example: [2.1, 2.1] },
      { key: "qcRequired", title: "QC required (yes/no)", aliases: ["qc required (yes/no)", "qc required", "qc"], example: ["no", "yes"] },
      { key: "name2", title: "Second name", aliases: ["second name", "name 2", "turkish name", "english name", "description 2"], example: ["", ""] },
      { key: "kind", title: "Kind (product/sticker/material)", aliases: ["kind (product/sticker/material)", "kind", "item type", "type"], example: ["product", "product"] },
      { key: "unit", title: "Unit (pcs/kg)", aliases: ["unit (pcs/kg)", "unit"], example: ["pcs", "pcs"] },
      { key: "labelCode", title: "Label code", aliases: ["label code", "sticker code", "etiket code"], example: ["", ""] },
      { key: "unitWeightKg", title: "Weight per bag (kg)", aliases: ["weight per bag (kg)", "weight per bag", "bag weight", "weight per piece (kg)"], example: ["", ""] },
    ],
  },
  recipes: {
    title: "Recipe",
    cols: [
      { key: "product", title: "Product code", aliases: ["product code", "product"], required: true, example: ["CAP28-ZAKHO", "CAP28-ZAKHO"] },
      { key: "item", title: "Item code", aliases: ["item code", "component code", "material code", "item"], required: true, example: ["RAW-PP", "CARTON-CAP"] },
      { key: "qty", title: "Quantity", aliases: ["quantity", "qty", "amount"], required: true, example: [2.1, 1800] },
      { key: "per", title: "Per (piece / pack)", aliases: ["per (piece / pack)", "per (piece/carton)", "per", "basis"], required: true, example: ["piece", "pack"] },
    ],
  },
};
const ORDER: SheetKey[] = ["machines", "molds", "products", "recipes"];
export const MAX_ROWS = 5000;
const CODE_RE = /^[A-Za-z0-9._\-/]{1,40}$/;

// ───────────────────────────────────────── template
export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bereket Plastic FMS";
  const help = wb.addWorksheet("How to use");
  help.columns = [{ width: 110 }];
  [
    "Bereket Plastic — import machines, molds and products",
    "",
    "1. Fill in the sheets Machines, Molds and Products. Delete the grey example rows first. Keep the headings in row 1.",
    "2. Every printed label is its own product. Put one row per label on the Products sheet, with the code of the mold it is made on.",
    "3. Product code can be left empty — the system then gives it MOLDCODE-001, -002 … automatically.",
    "4. Columns marked * are required. A code that already exists is updated; empty cells never delete existing information.",
    "5. Recipe sheet (optional): one row per item a product uses. Per = piece → amount for one piece (grams for kg items, pieces for others). Per = pack → how many products go into ONE carton / nylon bag.",
    "6. In the system: Products → Import from Excel → choose this file → Check file → Import.",
    "",
    "١. املأ الأوراق Machines و Molds و Products. احذف صفوف المثال الرمادية. أبقِ العناوين في الصف الأول.",
    "٢. كل ملصق مطبوع هو منتج مستقل. ضع صفاً لكل ملصق في ورقة Products مع رمز القالب.",
    "٣. يمكن ترك رمز المنتج فارغاً — يعطيه النظام رمزاً تلقائياً.",
    "",
    "1. Machines, Molds ve Products sayfalarını doldurun. Gri örnek satırları silin. Başlıklar 1. satırda kalsın.",
    "2. Her baskılı etiket ayrı bir üründür. Products sayfasında her etiket için bir satır ve kalıp kodu yazın.",
    "3. Ürün kodu boş bırakılabilir — sistem otomatik kod verir.",
  ].forEach((l, i) => { const r = help.addRow([l]); if (i === 0) r.font = { bold: true, size: 14 }; });
  for (const key of ORDER) {
    const def = SHEETS[key];
    const ws = wb.addWorksheet(def.title, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = def.cols.map((c) => ({ header: c.title + (c.required ? " *" : ""), key: c.key, width: Math.max(16, c.title.length + 6) }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    for (let i = 0; i < 2; i++) {
      const row = ws.addRow(Object.fromEntries(def.cols.map((c) => [c.key, c.example[i] === "" ? null : c.example[i]])));
      row.font = { color: { argb: "FF9CA3AF" }, italic: true };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────────────────────────────────── reading
type RawRow = { row: number; v: Record<string, string> };
export type ImportError = { sheet: SheetKey; row: number; message: string };

const norm = (s: string) => s.toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();
function mapHeaders(headers: string[], key: SheetKey) {
  const cols = SHEETS[key].cols;
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    const col = cols.find((c) => c.aliases.includes(n) && idx[c.key] === undefined);
    if (col) idx[col.key] = i;
  });
  return idx;
}
function guessSheet(name: string, headers: string[]): SheetKey | null {
  const n = norm(name);
  if (n.startsWith("machine")) return "machines";
  if (n.startsWith("mold") || n.startsWith("mould")) return "molds";
  if (n.startsWith("recipe") || n.startsWith("bom")) return "recipes";
  if (n.startsWith("product") || n.startsWith("label")) return "products";
  const h = headers.map(norm);
  if (h.includes("item code") && h.includes("quantity")) return "recipes";
  if (h.some((x) => ["label", "label / product name", "product code", "product name"].includes(x))) return "products";
  if (h.some((x) => ["cavities", "mold code", "mould code"].includes(x))) return "molds";
  if (h.some((x) => ["tonnage", "machine code"].includes(x))) return "machines";
  return null;
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : text.includes("\t") ? "\t" : ",";
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const isExample = (key: SheetKey, v: Record<string, string>) =>
  SHEETS[key].cols.every((c) => (v[c.key] ?? "") === String(c.example[0] ?? "") ) ||
  SHEETS[key].cols.every((c) => (v[c.key] ?? "") === String(c.example[1] ?? ""));

export async function readFile(buf: Buffer, filename: string) {
  const tables: { name: string; rows: string[][] }[] = [];
  if (/\.csv$|\.txt$/i.test(filename)) {
    tables.push({ name: filename.replace(/\.[^.]+$/, ""), rows: parseCsv(buf.toString("utf8").replace(/^﻿/, "")) });
  } else {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new Error("BAD_FILE"); }
    wb.eachSheet((ws) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: true }, (r) => {
        const cells: string[] = [];
        for (let i = 1; i <= ws.columnCount; i++) cells.push(r.getCell(i).text ?? "");
        rows.push(cells);
      });
      tables.push({ name: ws.name, rows });
    });
  }
  const out: Partial<Record<SheetKey, RawRow[]>> = {};
  const errors: ImportError[] = [];
  for (const tb of tables) {
    if (tb.rows.length === 0) continue;
    const headers = tb.rows[0].map((h) => String(h ?? ""));
    const key = guessSheet(tb.name, headers);
    if (!key) continue;
    const idx = mapHeaders(headers, key);
    const missing = SHEETS[key].cols.filter((c) => c.required && idx[c.key] === undefined);
    if (missing.length) { errors.push({ sheet: key, row: 1, message: `Missing column: ${missing.map((m) => m.title).join(", ")}` }); continue; }
    const rows: RawRow[] = [];
    tb.rows.slice(1).forEach((cells, i) => {
      const v: Record<string, string> = {};
      for (const [k, col] of Object.entries(idx)) v[k] = String(cells[col] ?? "").trim();
      if (Object.values(v).every((x) => !x)) return;
      if (isExample(key, v)) return; // the grey example rows from the template
      rows.push({ row: i + 2, v });
    });
    if (rows.length > MAX_ROWS) errors.push({ sheet: key, row: 1, message: `More than ${MAX_ROWS} rows — split the file.` });
    out[key] = [...(out[key] ?? []), ...rows];
  }
  return { sheets: out, errors };
}

// ───────────────────────────────────────── checking + saving
export type Plan = {
  counts: Record<SheetKey, { create: number; update: number; same: number }>;
  errors: ImportError[];
  empty: boolean;
};

type Kind = "PRODUCT" | "STICKER" | "MATERIAL" | "PACKAGING";
const KIND: Record<string, Kind> = {
  packaging: "PACKAGING", تغليف: "PACKAGING", ambalaj: "PACKAGING",
  product: "PRODUCT", products: "PRODUCT", منتج: "PRODUCT", ürün: "PRODUCT", urun: "PRODUCT",
  sticker: "STICKER", stickers: "STICKER", label: "STICKER", etiket: "STICKER", ستيكر: "STICKER", اتيكيت: "STICKER",
  material: "MATERIAL", materials: "MATERIAL", مادة: "MATERIAL", مواد: "MATERIAL", malzeme: "MATERIAL", hammadde: "MATERIAL",
};
const UNIT: Record<string, string> = { pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", عدد: "pcs", adet: "pcs", kg: "kg", كغم: "kg", كيلو: "kg" };
const num = (s: string) => (s === "" ? undefined : Number(s.replace(",", ".")));
const yes = (s: string) => /^(y|yes|true|1|x|✓|نعم|evet|e)$/i.test(s.trim());

export async function planImport(sheets: Partial<Record<SheetKey, RawRow[]>>, preErrors: ImportError[], save: false): Promise<Plan>;
export async function planImport(sheets: Partial<Record<SheetKey, RawRow[]>>, preErrors: ImportError[], save: true, tx: Prisma.TransactionClient): Promise<Plan>;
export async function planImport(sheets: Partial<Record<SheetKey, RawRow[]>>, preErrors: ImportError[], save: boolean, tx?: Prisma.TransactionClient): Promise<Plan> {
  const c = tx ?? db;
  const errors = [...preErrors];
  const counts = { machines: { create: 0, update: 0, same: 0 }, molds: { create: 0, update: 0, same: 0 }, products: { create: 0, update: 0, same: 0 }, recipes: { create: 0, update: 0, same: 0 } };
  const err = (sheet: SheetKey, row: number, message: string) => { if (errors.length < 500) errors.push({ sheet, row, message }); };

  // Machines
  const machines = await c.machine.findMany({ select: { id: true, code: true, name: true, manufacturer: true, model: true, tonnage: true } });
  const machineByCode = new Map(machines.map((m) => [m.code, m]));
  const seenM = new Set<string>();
  const machineRows: { code: string; data: Prisma.MachineUncheckedCreateInput; existing?: (typeof machines)[number] }[] = [];
  for (const { row, v } of sheets.machines ?? []) {
    const code = v.code.toUpperCase();
    if (!CODE_RE.test(code)) { err("machines", row, `"${v.code}" isn't a valid code (letters, numbers, - _ . /).`); continue; }
    if (seenM.has(code)) { err("machines", row, `${code} appears twice.`); continue; }
    seenM.add(code);
    if (!v.name) { err("machines", row, "Name is required."); continue; }
    const tonnage = num(v.tonnage ?? "");
    if (tonnage !== undefined && (!Number.isInteger(tonnage) || tonnage < 0)) { err("machines", row, "Tonnage must be a whole number."); continue; }
    machineRows.push({ code, existing: machineByCode.get(code), data: { code, name: v.name.slice(0, 120), manufacturer: v.manufacturer || undefined, model: v.model || undefined, tonnage } });
  }
  const machineCodes = new Set([...machineByCode.keys(), ...seenM]);

  // Molds
  const molds = await c.mold.findMany({ select: { id: true, code: true, name: true, cavities: true, currentMachineId: true, notes: true } });
  const moldByCode = new Map(molds.map((m) => [m.code, m]));
  const seenMo = new Set<string>();
  const moldRows: { code: string; machine?: string; data: { name: string; cavities?: number; notes?: string }; existing?: (typeof molds)[number] }[] = [];
  for (const { row, v } of sheets.molds ?? []) {
    const code = v.code.toUpperCase();
    if (!CODE_RE.test(code)) { err("molds", row, `"${v.code}" isn't a valid code (letters, numbers, - _ . /).`); continue; }
    if (seenMo.has(code)) { err("molds", row, `${code} appears twice.`); continue; }
    seenMo.add(code);
    if (!v.name) { err("molds", row, "Name is required."); continue; }
    const cavities = num(v.cavities ?? "");
    if (cavities !== undefined && (!Number.isInteger(cavities) || cavities < 1 || cavities > 512)) { err("molds", row, "Cavities must be a whole number from 1 to 512."); continue; }
    const machine = v.machine ? v.machine.toUpperCase() : undefined;
    if (machine && !machineCodes.has(machine)) { err("molds", row, `Machine ${machine} doesn't exist (add it on the Machines sheet).`); continue; }
    moldRows.push({ code, machine, existing: moldByCode.get(code), data: { name: v.name.slice(0, 120), cavities, notes: v.notes || undefined } });
  }
  const moldCodes = new Set([...moldByCode.keys(), ...seenMo]);

  // Products
  const products = await c.product.findMany({ select: { id: true, code: true, name: true, name2: true, kind: true, unit: true, moldId: true, material: true, color: true, weightGrams: true, qcRequired: true, piecesPerCarton: true, unitWeightKg: true, labelId: true } });
  const productByCode = new Map(products.map((p) => [p.code, p]));
  const moldIdToCode = new Map(molds.map((m) => [m.id, m.code]));
  const productByMoldName = new Map(products.filter((p) => p.moldId).map((p) => [`${moldIdToCode.get(p.moldId!)}|${p.name.toLowerCase()}`, p]));
  const seenP = new Set<string>(), seenPn = new Set<string>();
  const productRows: { code?: string; mold?: string; labelCode?: string; data: { name: string; name2?: string; kind?: Kind; unit?: string; unitWeightKg?: number; material?: string; color?: string; weightGrams?: number; qcRequired?: boolean }; existing?: (typeof products)[number] }[] = [];
  for (const { row, v } of sheets.products ?? []) {
    const code = v.code ? v.code.toUpperCase() : undefined;
    const mold = v.mold ? v.mold.toUpperCase() : undefined;
    if (code && !CODE_RE.test(code)) { err("products", row, `"${v.code}" isn't a valid product code (letters, numbers, - _ . /, up to 40).`); continue; }
    if (!v.name) { err("products", row, "Label / product name is required."); continue; }
    if (v.name.length > 160) { err("products", row, "Name is longer than 160 characters."); continue; }
    if (mold && !moldCodes.has(mold)) { err("products", row, `Mold ${mold} doesn't exist (add it on the Molds sheet).`); continue; }
    if (!code && !mold) { err("products", row, "Give a product code or a mold code."); continue; }
    if (code && seenP.has(code)) { err("products", row, `${code} appears twice.`); continue; }
    const mn = `${mold}|${v.name.toLowerCase()}`;
    if (!code && seenPn.has(mn)) { err("products", row, `"${v.name}" appears twice on mold ${mold}.`); continue; }
    if (code) seenP.add(code); else seenPn.add(mn);
    const kind = v.kind ? KIND[norm(v.kind)] : undefined;
    if (v.kind && !kind) { err("products", row, `Kind must be product, sticker or material (not "${v.kind}").`); continue; }
    const unit = v.unit ? UNIT[norm(v.unit)] : undefined;
    if (v.unit && !unit) { err("products", row, `Unit must be pcs or kg (not "${v.unit}").`); continue; }
    if ((v.name2 ?? "").length > 160) { err("products", row, "Second name is longer than 160 characters."); continue; }
    const weightGrams = num(v.weightGrams ?? "");
    if (weightGrams !== undefined && (Number.isNaN(weightGrams) || weightGrams < 0)) { err("products", row, "Weight must be a number."); continue; }
    const unitWeightKg = num(v.unitWeightKg ?? "");
    if (unitWeightKg !== undefined && (Number.isNaN(unitWeightKg) || unitWeightKg <= 0)) { err("products", row, "Weight per bag must be a number in kg."); continue; }
    const labelCode = v.labelCode ? v.labelCode.toUpperCase() : undefined;
    const existing = code ? productByCode.get(code) : productByMoldName.get(mn);
    productRows.push({
      code, mold, existing, labelCode,
      data: { name: v.name, name2: v.name2 || undefined, kind, unit, unitWeightKg, material: v.material || undefined, color: v.color || undefined, weightGrams, qcRequired: v.qcRequired ? yes(v.qcRequired) : undefined },
    });
  }

  // Labels must be stickers (already in the system or on this sheet)
  const kindOf = new Map<string, Kind>(products.map((p) => [p.code, p.kind as Kind]));
  for (const r of productRows) if (r.code) kindOf.set(r.code, r.data.kind ?? (r.existing?.kind as Kind) ?? "PRODUCT");
  const rowOf = new Map((sheets.products ?? []).map((x) => [x.v.code?.toUpperCase(), x.row]));
  for (const r of productRows) {
    if (r.labelCode && kindOf.get(r.labelCode) !== "STICKER") err("products", (r.code && rowOf.get(r.code)) || 0, `Label ${r.labelCode} isn't a sticker in the system or on this sheet.`);
  }
  // Recipe lines
  const recipeRows: { product: string; item: string; qty: number; per: "PIECE" | "CARTON" }[] = [];
  const seenR = new Set<string>();
  for (const { row, v } of sheets.recipes ?? []) {
    const product = v.product.toUpperCase(), item = v.item.toUpperCase();
    const qty = num(v.qty ?? ""), per = /^(pack|c|carton|cartons|nylon|bag|كارتون|نايلون|koli|naylon|torba)/i.test(v.per) ? "CARTON" : /^(p|piece|pieces|pcs|قطعة|عدد|adet)/i.test(v.per) ? "PIECE" : null;
    if (kindOf.get(product) !== "PRODUCT") { err("recipes", row, `${product} isn't a product in the system or on the Products sheet.`); continue; }
    if (!kindOf.has(item)) { err("recipes", row, `Item ${item} doesn't exist.`); continue; }
    if (item === product) { err("recipes", row, "A product can't be made of itself."); continue; }
    if (qty === undefined || Number.isNaN(qty) || qty <= 0) { err("recipes", row, "Quantity must be more than 0."); continue; }
    if (!per) { err("recipes", row, `Per must be piece or pack (not "${v.per}").`); continue; }
    if (per === "CARTON" && kindOf.get(item) !== "PACKAGING") { err("recipes", row, `${item} isn't a packaging item; use "piece" for materials.`); continue; }
    const k = `${product}|${item}|${per}`;
    if (seenR.has(k)) { err("recipes", row, `${item} is listed twice for ${product}.`); continue; }
    seenR.add(k); recipeRows.push({ product, item, qty, per });
  }
  counts.recipes.create = recipeRows.length;

  const changed = (before: Record<string, unknown>, after: Record<string, unknown>) =>
    Object.entries(after).some(([k, val]) => val !== undefined && String(before[k] ?? "") !== String(val));
  for (const r of machineRows) counts.machines[r.existing ? (changed(r.existing, r.data) ? "update" : "same") : "create"]++;
  for (const r of moldRows) {
    const curMachine = r.existing?.currentMachineId ? machines.find((m) => m.id === r.existing!.currentMachineId)?.code : undefined;
    counts.molds[r.existing ? (changed(r.existing, r.data) || (r.machine && r.machine !== curMachine) ? "update" : "same") : "create"]++;
  }
  for (const r of productRows) {
    const curMold = r.existing?.moldId ? moldIdToCode.get(r.existing.moldId) : undefined;
    const curLabel = r.existing?.labelId ? products.find((p) => p.id === r.existing!.labelId)?.code : undefined;
    counts.products[r.existing ? (changed(r.existing, r.data) || (r.mold && r.mold !== curMold) || (r.labelCode && r.labelCode !== curLabel) ? "update" : "same") : "create"]++;
  }
  const empty = !machineRows.length && !moldRows.length && !productRows.length && !recipeRows.length;
  if (!save || errors.length || empty) return { counts, errors, empty };

  // ── save (inside the caller's transaction)
  const t = tx!;
  for (const r of machineRows) {
    if (r.existing) await t.machine.update({ where: { id: r.existing.id }, data: strip(r.data) });
    else { const m = await t.machine.create({ data: r.data }); machineByCode.set(m.code, m); }
  }
  const machineId = async (code: string) => machineByCode.get(code)?.id ?? (await t.machine.findUniqueOrThrow({ where: { code } })).id;
  for (const r of moldRows) {
    const data = { ...strip(r.data), ...(r.machine ? { currentMachineId: await machineId(r.machine), status: "IN_USE" as const } : {}) };
    if (r.existing) await t.mold.update({ where: { id: r.existing.id }, data });
    else { const m = await t.mold.create({ data: { code: r.code, ...data, name: r.data.name } }); moldByCode.set(m.code, m); }
  }
  const moldId = (code: string) => moldByCode.get(code)!.id;
  // automatic codes: MOLDCODE-001, -002 … skipping any code already used
  const taken = new Set([...productByCode.keys(), ...productRows.filter((r) => r.code).map((r) => r.code!)]);
  const seq = new Map<string, number>();
  const nextCode = (mold: string) => {
    let n = seq.get(mold) ?? 0, code: string;
    do code = `${mold}-${String(++n).padStart(3, "0")}`; while (taken.has(code));
    seq.set(mold, n); taken.add(code);
    return code;
  };
  const creates: Prisma.ProductCreateManyInput[] = [];
  for (const r of productRows) {
    const data = { ...strip(r.data), ...(r.mold ? { moldId: moldId(r.mold) } : {}) };
    if (r.existing) await t.product.update({ where: { id: r.existing.id }, data });
    else creates.push({ ...data, name: r.data.name, code: r.code ?? nextCode(r.mold!), qcRequired: r.data.qcRequired ?? false });
  }
  for (let i = 0; i < creates.length; i += 500) await t.product.createMany({ data: creates.slice(i, i + 500) });
  // Links that need the ids of items just created: labels and recipes
  const needIds = [...new Set([...productRows.flatMap((r) => (r.labelCode ? [r.labelCode, r.code!] : [])), ...recipeRows.flatMap((r) => [r.product, r.item])])];
  if (needIds.length) {
    const ids = new Map((await t.product.findMany({ where: { code: { in: needIds } }, select: { id: true, code: true } })).map((p) => [p.code, p.id]));
    for (const r of productRows) if (r.labelCode && r.code) await t.product.update({ where: { id: ids.get(r.code)! }, data: { labelId: ids.get(r.labelCode)! } });
    const byProduct = new Map<string, typeof recipeRows>();
    for (const r of recipeRows) byProduct.set(r.product, [...(byProduct.get(r.product) ?? []), r]);
    for (const [prod, lines] of byProduct) {
      const pid = ids.get(prod)!;
      await t.productComponent.deleteMany({ where: { productId: pid } }); // the sheet replaces that product's whole recipe
      await t.productComponent.createMany({ data: lines.map((l) => ({ productId: pid, componentId: ids.get(l.item)!, qty: l.qty, per: l.per })) });
    }
  }
  return { counts, errors, empty };
}

function strip<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
