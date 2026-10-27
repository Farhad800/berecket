"""Warehouse: value of each item in stock and the stock value per section / all, in IQD."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("cost", {
    "colValue": ("Value (IQD)", "القيمة (دينار)", "Değer (IQD)"),
    "colUnit": ("Cost / unit (IQD)", "تكلفة الوحدة (دينار)", "Birim maliyet (IQD)"),
    "colPiece": ("Cost / piece (IQD)", "تكلفة القطعة (دينار)", "Adet maliyeti (IQD)"),
    "stockValue": ("Stock value", "قيمة المخزون", "Stok değeri"),
    "valueOf": ("Show the value of", "عرض قيمة", "Değerini göster"),
    "valueHint": ("In IQD: what is in stock × its cost. {n} items in stock.", "بالدينار: الموجود في المخزن × تكلفته. {n} مادة في المخزن.", "IQD olarak: stoktaki miktar × maliyeti. Stokta {n} kalem."),
    "valueNoCost": ("{n} of them have no cost yet and are not counted", "{n} منها بلا تكلفة بعد ولا تُحسب", "{n} tanesinin henüz maliyeti yok, sayılmadı"),
})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
