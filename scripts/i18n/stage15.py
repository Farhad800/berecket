"""New product with made-of + packaging in one form; packaging = products per one carton / nylon bag."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("rc", {
    "packaging": ("Packaging", "التغليف", "Ambalaj"),
    "packagingHint": ("For each carton or nylon: how many products go into one. Started cartons and bags count as used. Nylon kept in kg is turned into kg with its bag weight.", "لكل كارتون أو نايلون: كم منتجاً يدخل في واحد. الكارتون أو الكيس المبدوء يُحسب مستخدماً. النايلون المخزّن بالكيلو يُحوّل بوزن الكيس.", "Her koli veya naylon için: birine kaç ürün girer. Başlanan koli ve torba kullanılmış sayılır. Kg tutulan naylon torba ağırlığıyla kg'ye çevrilir."),
    "productsInOne": ("products in one", "منتج في الواحد", "bir tanesine ürün"),
    "packExample": ("One holds {n} products", "الواحد يسع {n} منتجاً", "Bir tanesi {n} ürün alır"),
    "addPackaging": ("Add carton / nylon", "إضافة كارتون / نايلون", "Koli / naylon ekle"),
    "madeOf": ("Made of (per piece)", "المكونات (لكل قطعة)", "İçerik (parça başına)"),
    "madeOfHint": ("Raw materials and colours in grams per piece; handles and other parts in pieces per piece.", "المواد الأولية والألوان بالغرام لكل قطعة؛ اليدات والقطع الأخرى بالعدد لكل قطعة.", "Hammadde ve boyalar parça başına gram; saplar ve diğer parçalar parça başına adet."),
    "addMaterial": ("Add material / colour / part", "إضافة مادة / لون / قطعة", "Malzeme / boya / parça ekle"),
    "nameNoLabel": ("Only when the product has no label.", "فقط عندما لا يكون للمنتج ملصق.", "Yalnızca ürünün etiketi yoksa."),
    "nameWillBe": ("Product name (from the label):", "اسم المنتج (من الملصق):", "Ürün adı (etiketten):"),
    "create": ("Create product", "إنشاء المنتج", "Ürünü oluştur"),
    "newIntro": ("Pick the label first — the name comes from it. Then add what one piece is made of and how it is packed.", "اختر الملصق أولاً — يُؤخذ الاسم منه. ثم أضف مكونات القطعة الواحدة وطريقة تغليفها.", "Önce etiketi seçin — ad ondan gelir. Sonra bir parçanın içeriğini ve ambalajını ekleyin."),
    "created": ("Product created. Daily production will now take its label, materials and packaging from stock.", "تم إنشاء المنتج. سيخصم الإنتاج اليومي الآن ملصقه ومواده وتغليفه من المخزون.", "Ürün oluşturuldu. Günlük üretim artık etiketini, malzemelerini ve ambalajını stoktan düşecek."),
})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
