"""Recipes ("made of"), packaging, labels per product, automatic use from production."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("wh.tab", {"stickers": ("Labels", "الملصقات", "Etiketler"), "materials": ("Raw materials", "المواد الأولية", "Hammaddeler"), "packaging": ("Packaging", "التغليف", "Ambalaj")})
group("wh", {"noPackaging": ("No packaging items yet. Add them with Import from Excel.", "لا مواد تغليف بعد. أضفها عبر الاستيراد من إكسل.", "Henüz ambalaj kalemi yok. Excel'den içe aktararak ekleyin.")})
group("daily", {"shortage": ("Saved — but stock was not enough for: {items}. Stock shows minus; the warehouse has been told.", "تم الحفظ — لكن المخزون لم يكفِ لـ: {items}. يظهر المخزون بالسالب وتم إبلاغ المستودع.", "Kaydedildi — ama stok yetmedi: {items}. Stok eksiye düştü; depoya bildirildi.")})
group("md", {
    "label": ("Label", "الملصق", "Etiket"),
    "labelHint": ("Choose the product's label — the name comes from the label. Leave empty if the product has no label.", "اختر ملصق المنتج — يُؤخذ الاسم من الملصق. اتركه فارغاً إذا لم يكن للمنتج ملصق.", "Ürünün etiketini seçin — ad etiketten gelir. Etiketi yoksa boş bırakın."),
    "productNameFromLabel": ("Only for products without a label. With a label, the name is taken from the label.", "فقط للمنتجات بدون ملصق. مع الملصق يُؤخذ الاسم منه.", "Yalnızca etiketsiz ürünler için. Etiket seçilirse ad etiketten alınır."),
    "noLabel": ("No label", "بدون ملصق", "Etiketsiz"),
    "recipeLink": ("Made of & packaging", "المكونات والتغليف", "İçerik ve ambalaj"),
    "recipe": ("Made of / packaging", "المكونات / التغليف", "İçerik / ambalaj"),
    "recipeLines": ("{n} items", "{n} مادة", "{n} kalem"),
    "kindLabel": ("Kind", "النوع", "Tür"),
    "labelUsedBy": ("Products with this label", "المنتجات بهذا الملصق", "Bu etiketli ürünler"),
    "usedBy": ("Used by these products", "تستخدمه هذه المنتجات", "Bu ürünlerde kullanılıyor"),
    "notUsedYet": ("Not used by any product yet.", "لا يستخدمه أي منتج بعد.", "Henüz hiçbir üründe kullanılmıyor."),
    "unitWeight": ("Weight of one bag / piece", "وزن الكيس / القطعة الواحدة", "Bir torba / parça ağırlığı"),
    "unitWeightHint": ("Needed when products count this item by the bag (e.g. 30 nylon per carton) but it is stocked in kg.", "مطلوب عندما تحسب المنتجات هذه المادة بالكيس (مثلاً 30 نايلون لكل كارتون) بينما تُخزن بالكيلو.", "Ürünler bunu torba ile sayıp (örn. koli başına 30 naylon) stok kg ise gerekir."),
    "saved": ("Saved.", "تم الحفظ.", "Kaydedildi."),
    "save": ("Save", "حفظ", "Kaydet"),
})
group("md.kind", {"PRODUCT": ("Product", "منتج", "Ürün"), "STICKER": ("Label", "ملصق", "Etiket"), "MATERIAL": ("Raw material", "مادة أولية", "Hammadde"), "PACKAGING": ("Packaging", "تغليف", "Ambalaj")})
group("rc", {
    "label": ("Label", "الملصق", "Etiket"),
    "labelHint": ("1 label per piece is taken from stock when production is entered.", "يُخصم ملصق واحد لكل قطعة من المخزون عند إدخال الإنتاج.", "Üretim girildiğinde parça başına 1 etiket stoktan düşülür."),
    "madeOf": ("Made of (per piece)", "المكونات (لكل قطعة)", "İçerik (parça başına)"),
    "madeOfHint": ("Raw material, dye and regrind in grams per piece; handles and other parts in pieces per piece.", "المواد والصبغ والمعاد بالغرام لكل قطعة؛ اليدات والقطع الأخرى بالعدد لكل قطعة.", "Hammadde, boya ve kırma parça başına gram; saplar ve diğer parçalar parça başına adet."),
    "addMaterial": ("Add material / part", "إضافة مادة / قطعة", "Malzeme / parça ekle"),
    "packaging": ("Packaging (per carton)", "التغليف (لكل كارتون)", "Ambalaj (koli başına)"),
    "packagingHint": ("Cartons are rounded up; nylon counts the bags actually filled and is turned into kg with the bag weight.", "تُقرّب الكراتين للأعلى؛ ويُحسب النايلون بالأكياس المملوءة فعلاً ويُحوّل إلى كيلو بوزن الكيس.", "Koliler yukarı yuvarlanır; naylon gerçekten dolan torba sayısıyla hesaplanır ve torba ağırlığıyla kg'ye çevrilir."),
    "piecesPerCarton": ("Pieces in one carton", "عدد القطع في الكارتون", "Bir kolideki adet"),
    "addPackaging": ("Add carton / nylon / packaging", "إضافة كارتون / نايلون / تغليف", "Koli / naylon / ambalaj ekle"),
    "chooseItem": ("Choose item…", "اختر المادة…", "Kalem seçin…"),
    "gPerPiece": ("grams per piece", "غرام لكل قطعة", "parça başına gram"),
    "pcsPerPiece": ("pieces per piece", "عدد لكل قطعة", "parça başına adet"),
    "bagsPerCarton": ("bags per carton", "كيس لكل كارتون", "koli başına torba"),
    "pcsPerCarton": ("per carton", "لكل كارتون", "koli başına"),
    "needWeight": ("Set the weight of one bag first", "حدّد وزن الكيس الواحد أولاً", "Önce bir torbanın ağırlığını girin"),
    "save": ("Save made of & packaging", "حفظ المكونات والتغليف", "İçerik ve ambalajı kaydet"),
    "saved": ("Saved. From now on daily production takes these from stock.", "تم الحفظ. من الآن يخصم الإنتاج اليومي هذه من المخزون.", "Kaydedildi. Artık günlük üretim bunları stoktan düşer."),
    "preview": ("What production will use", "ما سيستخدمه الإنتاج", "Üretimin kullanacağı"),
    "previewPieces": ("pieces", "قطعة", "adet"),
    "nothingUsed": ("Nothing is taken from stock yet — add a label, materials or packaging.", "لا يُخصم شيء بعد — أضف ملصقاً أو مواد أو تغليفاً.", "Henüz stoktan bir şey düşülmüyor — etiket, malzeme veya ambalaj ekleyin."),
    "inStockOnly": ("only {n} in stock", "المتوفر {n} فقط", "stokta yalnızca {n}"),
    "previewNote": ("Unsaved changes are included in the preview.", "التغييرات غير المحفوظة مشمولة في المعاينة.", "Kaydedilmemiş değişiklikler önizlemeye dahildir."),
})
group("imp.sheet", {"recipes": ("Recipe lines", "أسطر المكونات", "İçerik satırları")})
group("history.product", {"recipe": ("Made of / packaging changed", "تغيير المكونات / التغليف", "İçerik / ambalaj değişti")})
def nt(t, title, body):
    add(f"nt.{t}.title", *title); add(f"nt.{t}.body", *body)
nt("stock.shortage", ("Not enough stock for production: {n} items", "المخزون لا يكفي للإنتاج: {n} مادة", "Üretim için stok yetersiz: {n} kalem"), ("{items} now below zero · entered by {by}", "{items} الآن تحت الصفر · أدخله {by}", "{items} şimdi sıfırın altında · giren {by}"))
B=("{ref} · by {by}", "{ref} · بواسطة {by}", "{ref} · {by}")
nt("stock.packagingIn", ("Packaging received: {n} items", "استلام تغليف: {n} مادة", "Ambalaj girişi: {n} kalem"), B)
nt("stock.packagingUsed", ("Packaging used: {n} items", "استخدام تغليف: {n} مادة", "Ambalaj kullanımı: {n} kalem"), B)
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
