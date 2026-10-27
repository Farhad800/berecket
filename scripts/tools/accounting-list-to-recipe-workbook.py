"""Accountant's list (.xls) → workbook for filling every product's made-of & packaging and every item's cost.
First sheet: one block of empty rows per product (label · raw materials · packaging) with drop-downs; the
item sheets carry the cost columns. Same sheet names / headings the system reads back (Items workbook upload)."""
import sys, re, collections, importlib.util
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L
SRC, FINAL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location("mi", __file__.replace("accounting-list-to-recipe-workbook.py", "accounting-list-to-workbook.py"))
# reuse the reading / code-fixing / classification of make_items.py without running its main part
src = open(spec.origin, encoding="utf-8").read().split("SUP = [")[0]
g = {"__name__": "mi"}; sys.argv = [spec.origin, SRC, FINAL, OUT]; exec(compile(src, spec.origin, "exec"), g)
rows, kind, unit, fixed = g["rows"], g["kind"], g["unit"], g["fixed"]
by = collections.defaultdict(list)
for r in rows: by[kind(r)].append(r)

BLUE, GREY, INFO, BAND = (PatternFill("solid", fgColor=c) for c in ["FF294680", "FF6B7280", "FFF1F3F6", "FFEAF0FA"])
thin = Side(style="thin", color="FFB8C2D6"); thick = Side(style="medium", color="FF294680")
wb = openpyxl.Workbook()
rec = wb.active; rec.title = "Made of & packaging"

def head(ws, cols):
    ws.freeze_panes = "A2"; ws.row_dimensions[1].height = 44
    for i, (en, ar, w, info) in enumerate(cols, 1):
        c = ws.cell(1, i, f"{en} · {ar}"); c.font = Font(bold=True, color="FFFFFFFF"); c.fill = GREY if info else BLUE
        c.alignment = Alignment(wrap_text=True, vertical="center"); ws.column_dimensions[L(i)].width = w

# ── item sheets (costs are filled here, once per item)
SUP = [("Code", "الرمز", 14, 0), ("Name *", "الاسم", 40, 0), ("Second name", "الاسم الثاني", 32, 0), ("Unit (pcs/kg)", "الوحدة", 11, 0), ("Weight of one bag (kg)", "وزن الكيس الواحد", 14, 0),
       ("Cost price", "سعر التكلفة", 13, 0), ("Currency (IQD/USD/EUR)", "العملة", 13, 0), ("Rate to IQD", "سعر الصرف إلى الدينار", 14, 0), ("Cost in IQD (calculated)", "التكلفة بالدينار (محسوبة)", 16, 1),
       ("In stock now (system)", "الموجود حالياً في النظام", 14, 1), ("Counted stock", "الجرد الفعلي", 13, 0)]
def item_sheet(title, data):
    ws = wb.create_sheet(title); head(ws, SUP)
    last = len(data) + 200
    for r in range(2, last + 1):
        v = data[r - 2] if r - 2 < len(data) else None
        if v:
            for i, x in enumerate(v, 1):
                if x not in (None, ""): ws.cell(r, i, x)
        ws.cell(r, 1).number_format = "@"
        ws[f"I{r}"] = f'=IF(F{r}="","",IF(OR(G{r}="",G{r}="IQD"),F{r},IF(H{r}="","rate?",F{r}*H{r})))'
        ws[f"I{r}"].fill = INFO; ws[f"J{r}"].fill = INFO
    for col, opts in [("D", "pcs,kg"), ("G", "IQD,USD,EUR")]:
        dv = DataValidation(type="list", formula1=f'"{opts}"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"{col}2:{col}{last}")
    return ws
SHEET = {"STICKER": "Labels", "MATERIAL": "Raw materials", "PACKAGING": "Packaging"}
for k in ["STICKER", "MATERIAL", "PACKAGING"]:
    item_sheet(SHEET[k], [[r[0], r[1], r[2] or None, unit(r[3])] for r in sorted(by[k], key=lambda x: x[1])])
pro = wb.create_sheet("Products")
PRO = [("Product code", "رمز المنتج", 16, 0), ("Name *", "الاسم", 40, 0), ("Second name", "الاسم الثاني", 32, 0), ("Mold code", "رمز القالب", 13, 0), ("Label code", "رمز الملصق", 13, 0),
       ("QC required (yes/no)", "فحص الجودة", 11, 0), ("In stock now (system)", "الموجود حالياً في النظام", 14, 1), ("Counted stock", "الجرد الفعلي", 13, 0)]
head(pro, PRO)
for i, r in enumerate(by["PRODUCT"], 2):
    pro.cell(i, 1, r[0]).number_format = "@"; pro.cell(i, 2, r[1]); pro.cell(i, 3, r[2] or None); pro.cell(i, 7).fill = INFO

# ── hidden lists for the drop-downs (name → code, unit), one block per kind
lists = wb.create_sheet("Lists"); lists.sheet_state = "hidden"
RANGES = {}
for j, k in enumerate(["STICKER", "MATERIAL", "PACKAGING"]):
    c0 = 1 + j * 4  # A/E/I
    items = sorted(by[k], key=lambda x: x[1])
    # Raw-material rows can also take a part made in the factory (the plastic handle is a product).
    if k == "MATERIAL": items += sorted(by["PRODUCT"], key=lambda x: x[1])
    lists.cell(1, c0, "name"); lists.cell(1, c0 + 1, "code"); lists.cell(1, c0 + 2, "unit")
    for i, r in enumerate(items, 2):
        lists.cell(i, c0, r[1]); lists.cell(i, c0 + 1, r[0]).number_format = "@"; lists.cell(i, c0 + 2, unit(r[3]))
    n = len(items) + 1
    RANGES[k] = (f"Lists!${L(c0)}$2:${L(c0)}${n}", f"Lists!${L(c0)}$2:${L(c0 + 2)}${n}")

# ── the main sheet: one block per product
REC = [("Product code *", "رمز المنتج", 14, 0), ("Product name", "اسم المنتج", 34, 1), ("Item type", "النوع", 13, 1), ("Item (choose from the list)", "المادة (اختر من القائمة)", 40, 0),
       ("Item code *", "رمز المادة", 12, 1), ("Quantity *", "الكمية", 11, 0), ("Per (piece/pack) *", "لكل (قطعة/عبوة)", 11, 0), ("Unit", "الوحدة", 8, 1),
       ("Cost per unit (IQD)", "تكلفة الوحدة (دينار)", 13, 1), ("Cost per piece (IQD)", "التكلفة للقطعة (دينار)", 13, 1), ("Product cost per piece (IQD)", "تكلفة القطعة من المنتج (دينار)", 15, 1)]
head(rec, REC)
BLOCK = [("STICKER", "Label · ملصق", "piece"), ("MATERIAL", "Raw material · مادة", "piece"), ("MATERIAL", "Raw material · مادة", "piece"), ("MATERIAL", "Raw material · مادة", "piece"),
         ("PACKAGING", "Packaging · تغليف", "pack"), ("PACKAGING", "Packaging · تغليف", "pack")]
dvs = {k: DataValidation(type="list", formula1=f"={RANGES[k][0]}", allow_blank=True, showErrorMessage=True, errorTitle="Bereket", error="Choose an item from the list (add new items on its sheet first).") for k in RANGES}
for dv in dvs.values(): rec.add_data_validation(dv)
dvper = DataValidation(type="list", formula1='"piece,pack"', allow_blank=True); rec.add_data_validation(dvper)
cost_of = lambda e: f'IFERROR(VLOOKUP({e},Labels!$A:$I,9,FALSE),IFERROR(VLOOKUP({e},\'Raw materials\'!$A:$I,9,FALSE),IFERROR(VLOOKUP({e},Packaging!$A:$I,9,FALSE),IFERROR(INDIRECT("K"&MATCH({e},$A:$A,0)),""))))'
r = 2
for bi, p in enumerate(by["PRODUCT"]):
    top = r
    for j, (k, label, per) in enumerate(BLOCK):
        rec.cell(r, 1, p[0]).number_format = "@"
        if j == 0:
            rec.cell(r, 2, p[1]).font = Font(bold=True); rec.cell(r, 1).font = Font(bold=True)
        else:
            rec.cell(r, 1).font = Font(color="FF9AA3B2")
        rec.cell(r, 3, label); rec.cell(r, 7, per)
        dvs[k].add(f"D{r}"); dvper.add(f"G{r}")
        rec[f"E{r}"] = f'=IF(D{r}="","",IFERROR(VLOOKUP(D{r},{RANGES[k][1]},2,FALSE),"?"))'
        rec[f"H{r}"] = f'=IF(D{r}="","",IFERROR(VLOOKUP(D{r},{RANGES[k][1]},3,FALSE),""))'
        where = {"STICKER": "Labels", "MATERIAL": "Raw materials", "PACKAGING": "Packaging"}[k]
        rec[f"I{r}"] = f'=IF(E{r}="","",IF({cost_of(f"E{r}")}="","→ {where}: cost? · السعر؟",{cost_of(f"E{r}")}))'
        if k == "STICKER":
            rec[f"J{r}"] = f'=IF(ISNUMBER(I{r}),I{r},"")'
        elif k == "PACKAGING":
            rec[f"J{r}"] = f'=IF(OR(NOT(ISNUMBER(I{r})),F{r}=""),"",IF(H{r}="kg",IF(N(VLOOKUP(E{r},Packaging!$A:$E,5,FALSE))>0,I{r}*VLOOKUP(E{r},Packaging!$A:$E,5,FALSE)/F{r},"bag weight? · وزن الكيس؟"),I{r}/F{r}))'
        else:
            rec[f"J{r}"] = f'=IF(OR(NOT(ISNUMBER(I{r})),F{r}=""),"",IF(H{r}="kg",F{r}/1000*I{r},F{r}*I{r}))'
        for c in range(1, 12):
            cell = rec.cell(r, c)
            if c in (2, 3, 5, 8, 9, 10, 11): cell.fill = INFO
            elif bi % 2: cell.fill = BAND
            cell.border = Border(top=thick if j == 0 else None, left=thin, right=thin, bottom=thin)
        r += 1
    rng_e, rng_j = f"E{top}:E{r - 1}", f"J{top}:J{r - 1}"
    rec[f"K{top}"] = f'=IF(SUMPRODUCT(--({rng_e}<>""))=0,"",IF(SUMPRODUCT(--({rng_e}<>""))>COUNT({rng_j}),"costs missing · تكاليف ناقصة",ROUND(SUM({rng_j}),2)))'; rec[f"K{top}"].font = Font(bold=True)

# ── how to use (last)
h = wb.create_sheet("How to use"); h.column_dimensions["A"].width = 125
for i, l in enumerate([
    "Bereket Plastic — made of, packaging and costs", "",
    "Sheet 'Made of & packaging': every product has its own block of rows: 1 label, 3 raw materials (granules, dye, handle…), 2 packaging (carton, nylon).",
    "  • Item: choose it from the drop-down list of that row. Its code, unit and cost fill in by themselves.",
    "  • Quantity: Label → leave empty. Raw material counted in kg → GRAMS for one piece (e.g. 50). Counted in pieces → pieces for one piece (handle = 1).",
    "  • A plastic handle made in the factory is a product: choose it in a Raw material row (it is in the same list, after the materials). Its cost comes from its own block. A metal handle is a bought raw material with its own price.",
    "    Packaging → how many products go into ONE carton / ONE nylon bag (e.g. 880).",
    "  • Rows you don't need stay empty. Products you don't fill stay as they are.",
    "Sheets 'Labels', 'Raw materials', 'Packaging': the cost of each item, ONCE: Cost price of 1 piece or 1 kg + Currency; for USD / EUR also the Rate to IQD.",
    "  Nylon (kg): also the weight of one bag in kg. Counted stock: what is on the shelf now (optional).",
    "Cost per piece / Product cost per piece: an estimate (each piece's exact share of a carton). The system works out a production run with full cartons.",
    "Upload when ready: Warehouse Stock → Items workbook (Excel) → Check file → Save everything.", "",
    "ورقة 'Made of & packaging': لكل منتج مجموعة صفوف: ملصق واحد، 3 مواد أولية، 2 تغليف (كارتون، نايلون).",
    "  • المادة: اخترها من القائمة المنسدلة. الرمز والوحدة والتكلفة تُملأ تلقائياً.",
    "  • الكمية: الملصق ← اتركه فارغاً. مادة بالكيلو ← غرامات للقطعة الواحدة. مادة بالعدد ← عدد للقطعة (يدة = 1). التغليف ← كم منتج يدخل في كرتون / كيس نايلون واحد.",
    "أوراق 'Labels' و 'Raw materials' و 'Packaging': تكلفة كل مادة مرة واحدة: سعر القطعة أو الكيلو + العملة؛ للدولار / اليورو سعر الصرف إلى الدينار. النايلون: وزن الكيس الواحد بالكيلو.",
]):
    c = h.cell(i + 1, 1, l); c.alignment = Alignment(wrap_text=True)
    if i == 0: c.font = Font(bold=True, size=14)
wb.save(OUT)
print({k: len(v) for k, v in by.items()}, "rows on main sheet:", r - 2, "codes fixed:", len(fixed))
