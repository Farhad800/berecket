"""Copy what the accountant typed in an older copy into the new workbook (same rows / same codes)."""
import sys, openpyxl
old, new, out = sys.argv[1:4]
o, n = openpyxl.load_workbook(old), openpyxl.load_workbook(new)
moved = 0
a, b = o["Made of & packaging"], n["Made of & packaging"]
for r in range(2, a.max_row + 1):
    if a.cell(r, 1).value is None: continue
    assert a.cell(r, 1).value == b.cell(r, 1).value and a.cell(r, 3).value == b.cell(r, 3).value, r
    for c in (4, 6, 7):
        v = a.cell(r, c).value
        if v not in (None, "") and v != b.cell(r, c).value: b.cell(r, c).value = v; moved += 1
for sh in ["Labels", "Raw materials", "Packaging", "Products"]:
    a, b = o[sh], n[sh]
    rows = {b.cell(r, 1).value: r for r in range(2, b.max_row + 1) if b.cell(r, 1).value}
    cols = (2, 3, 4, 5, 8) if sh == "Products" else (2, 3, 4, 5, 6, 7, 8, 11)
    for r in range(2, a.max_row + 1):
        code = a.cell(r, 1).value
        if not code: continue
        if code not in rows: raise SystemExit(f"new row in {sh}: {code}")
        for c in cols:
            v = a.cell(r, c).value
            if v not in (None, "") and not str(v).startswith("=") and v != b.cell(rows[code], c).value: b.cell(rows[code], c).value = v; moved += 1
n.save(out); print("cells carried over:", moved)
