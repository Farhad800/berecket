"""Product cost the accountant's way: for a number of pieces made, full cartons and nylon by kg."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("cost", {
    "productTitle": ("Product cost", "تكلفة المنتج", "Ürün maliyeti"),
    "productHint": ("For the number of pieces made: the same amounts production takes from stock — full cartons and bags (a started one counts), nylon by its kg — times each item's cost in IQD.", "لعدد القطع المنتجة: نفس الكميات التي يأخذها الإنتاج من المخزن — كراتين وأكياس كاملة (المبدوءة تُحسب)، والنايلون بالكيلو — مضروبة في تكلفة كل مادة بالدينار.", "Üretilen adet için: üretimin stoktan aldığı miktarlar — tam koli ve torbalar (başlanan sayılır), naylon kg olarak — her kalemin IQD maliyetiyle çarpılır."),
    "piecesMade": ("Pieces made", "عدد القطع المنتجة", "Üretilen adet"),
    "lastProduction": ("Last production of this product", "آخر إنتاج لهذا المنتج", "Bu ürünün son üretimi"),
    "typeQty": ("Type any quantity", "اكتب أي كمية", "Herhangi bir miktar yazın"),
    "used": ("Used for {n} pcs", "المستعمل لـ {n} قطعة", "{n} adet için kullanılan"),
    "runTotal": ("Total for {n} pieces (IQD)", "المجموع لـ {n} قطعة (دينار)", "{n} adet toplamı (IQD)"),
    "onePieceCost": ("Cost of one piece", "تكلفة القطعة الواحدة", "Bir adetin maliyeti"),
    "colPiece": ("Cost / piece", "تكلفة القطعة", "Maliyet / adet"),
    "tableHint": ("Cost per piece of each product's last production (or one full carton if not made yet): label + materials + full cartons and bags, in IQD. * = some of its items have no cost yet.", "تكلفة القطعة حسب آخر إنتاج لكل منتج (أو كرتون كامل إن لم يُنتج بعد): الملصق + المواد + الكراتين والأكياس الكاملة بالدينار. * = بعض موادها بلا تكلفة بعد.", "Her ürünün son üretimine göre adet maliyeti (henüz üretilmediyse bir tam koli): etiket + malzeme + tam koli ve torbalar, IQD. * = bazı kalemlerinin henüz maliyeti yok."),
})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
