"""Product name always typed by hand; the label is chosen under Made of (owner, 28 Oct 2026)."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
add("rc.details", "Product", "المنتج", "Ürün")
add("rc.nameTyped", "Type the product's own name. It never comes from the label (a label's name has \"اتيكيت\" in it).", "اكتب اسم المنتج بنفسك. لا يؤخذ من الإتيكيت أبداً (اسم الإتيكيت فيه كلمة \"اتيكيت\").", "Ürünün kendi adını yazın. Ad asla etiketten alınmaz (etiketin adında \"اتيكيت\" vardır).")
add("rc.labelHint", "The product's label: 1 label per piece is taken from stock when production is entered. Choosing it doesn't change the product's name.", "إتيكيت المنتج: يؤخذ إتيكيت واحد لكل قطعة من المخزون عند إدخال الإنتاج. اختياره لا يغيّر اسم المنتج.", "Ürünün etiketi: üretim girildiğinde her adet için 1 etiket stoktan düşülür. Seçmek ürünün adını değiştirmez.")
add("rc.onePerPiece", "1 per piece", "1 لكل قطعة", "adet başına 1")
add("md.labelHint", "The label used on this product (1 per piece). The product's name is typed by hand.", "الإتيكيت المستخدم على هذا المنتج (1 لكل قطعة). اسم المنتج يُكتب يدوياً.", "Bu üründe kullanılan etiket (adet başına 1). Ürünün adı elle yazılır.")
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
