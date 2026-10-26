"""Labels / raw materials / packaging added by hand, item costs, product cost, warehouse sections on stock forms."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("item", {
    "newButton": ("New item", "مادة جديدة", "Yeni kalem"),
    "newTitle": ("New label, raw material or packaging", "ملصق أو مادة أولية أو تغليف جديد", "Yeni etiket, hammadde veya ambalaj"),
    "intro": ("Choose what it is, type its name and how it is counted, and its cost.", "اختر نوعها واكتب اسمها وطريقة عدّها وتكلفتها.", "Ne olduğunu seçin, adını, nasıl sayıldığını ve maliyetini yazın."),
    "whatIsIt": ("What is it?", "ما نوعها؟", "Bu nedir?"),
    "name": ("Name", "الاسم", "Ad"),
    "name2": ("Second name", "الاسم الثاني", "İkinci ad"),
    "code": ("Code", "الرمز", "Kod"),
    "codeHint": ("Leave empty for an automatic code.", "اتركه فارغاً لرمز تلقائي.", "Otomatik kod için boş bırakın."),
    "unit": ("Counted in", "وحدة العد", "Birim"),
    "unitPcs": ("Pieces", "قطعة", "Adet"),
    "unitKg": ("Kilograms (kg)", "كيلوغرام (kg)", "Kilogram (kg)"),
    "bagWeight": ("Weight of one bag / piece (kg)", "وزن الكيس / القطعة الواحدة (kg)", "Bir torba / parçanın ağırlığı (kg)"),
    "bagWeightHint": ("For packaging bought by kg but used by the piece (e.g. nylon bags).", "للتغليف الذي يُشترى بالكيلو ويُستعمل بالقطعة (مثل أكياس النايلون).", "Kiloyla alınıp adetle kullanılan ambalaj için (ör. naylon poşet)."),
    "save": ("Save item", "حفظ المادة", "Kalemi kaydet"),
    "created": ("{code} saved. It is now in the warehouse and can be used in products, buying and stock movements.", "تم حفظ {code}. أصبحت في المخزن ويمكن استعمالها في المنتجات والشراء وحركات المخزون.", "{code} kaydedildi. Artık depoda; ürünlerde, alımlarda ve stok hareketlerinde kullanılabilir."),
    "section": ("Section", "القسم", "Bölüm"),
    "allSections": ("All", "الكل", "Tümü"),
})
group("md.kindPlural", {"PRODUCT": ("Products", "المنتجات", "Ürünler"), "STICKER": ("Labels", "الملصقات", "Etiketler"), "MATERIAL": ("Raw materials", "المواد الأولية", "Hammaddeler"), "PACKAGING": ("Packaging", "التغليف", "Ambalaj")})
group("cost", {
    "title": ("Cost", "التكلفة", "Maliyet"),
    "hint": ("Price of one unit, in the currency you paid. For USD or EUR also type today's rate — product costs are always worked out in IQD.", "سعر الوحدة الواحدة بالعملة التي دُفعت. للدولار أو اليورو اكتب أيضاً سعر الصرف اليوم — تكلفة المنتجات تُحسب دائماً بالدينار.", "Bir birimin fiyatı, ödenen para biriminde. USD veya EUR için bugünkü kuru da yazın — ürün maliyetleri her zaman IQD ile hesaplanır."),
    "onePiece": ("1 piece", "قطعة واحدة", "1 adet"),
    "price": ("Price of {per}", "سعر {per}", "{per} fiyatı"),
    "priceLabel": ("Price", "السعر", "Fiyat"),
    "currency": ("Price currency", "عملة السعر", "Fiyat para birimi"),
    "rate": ("Rate: 1 {cur} = ? IQD", "السعر: 1 {cur} = ? دينار", "Kur: 1 {cur} = ? IQD"),
    "rateLabel": ("Rate to IQD", "سعر الصرف إلى الدينار", "IQD kuru"),
    "rateHint": ("Today's rate, typed by you.", "سعر اليوم، تكتبه أنت.", "Bugünkü kur, sizin yazdığınız."),
    "inIqd": ("In IQD", "بالدينار", "IQD olarak"),
    "rateShort": ("rate 1 {cur} in IQD", "سعر 1 {cur} بالدينار", "1 {cur} kuru IQD"),
    "updated": ("Set {at}", "حُدّدت {at}", "Belirlendi {at}"),
    "none": ("No cost yet.", "لا توجد تكلفة بعد.", "Henüz maliyet yok."),
    "set": ("Set cost", "تحديد التكلفة", "Maliyet gir"),
    "change": ("Change cost", "تغيير التكلفة", "Maliyeti değiştir"),
    "save": ("Save cost", "حفظ التكلفة", "Maliyeti kaydet"),
    "productTitle": ("Cost of one piece", "تكلفة القطعة الواحدة", "Bir adetin maliyeti"),
    "productHint": ("Label + what it is made of + packaging, in IQD, from each item's cost. It changes when an item's cost changes.", "الملصق + المكونات + التغليف، بالدينار، من تكلفة كل مادة. تتغير عند تغيّر تكلفة أي مادة.", "Etiket + içerik + ambalaj, IQD olarak, her kalemin maliyetinden. Bir kalemin maliyeti değişince değişir."),
    "missing": ("No cost yet for: {items} — the total doesn't include them.", "لا توجد تكلفة بعد لـ: {items} — المجموع لا يشملها.", "Henüz maliyeti olmayanlar: {items} — toplama dahil değil."),
    "noRecipe": ("Nothing is set yet for what this product is made of and packed in, so its cost can't be worked out.", "هذا المنتج ليس له ملصق أو مكونات أو تغليف بعد، فلا يمكن حساب تكلفته.", "Bu ürünün henüz etiketi, içeriği veya ambalajı yok; maliyeti hesaplanamaz."),
    "perPiece": ("Per piece", "لكل قطعة", "Adet başına"),
    "unitCost": ("Cost per unit (IQD)", "تكلفة الوحدة (دينار)", "Birim maliyet (IQD)"),
    "cost": ("Cost (IQD)", "التكلفة (دينار)", "Maliyet (IQD)"),
    "colPiece": ("Cost / piece", "تكلفة القطعة", "Maliyet / adet"),
    "colUnit": ("Cost / unit", "تكلفة الوحدة", "Maliyet / birim"),
    "partial": ("Some items have no cost yet", "بعض المواد ليس لها تكلفة بعد", "Bazı kalemlerin henüz maliyeti yok"),
    "stockValue": ("Stock value", "قيمة المخزون", "Stok değeri"),
    "tableHint": ("Cost per piece = label + materials + packaging, in IQD. * = some of its items have no cost yet.", "تكلفة القطعة = الملصق + المكونات + التغليف بالدينار. * = بعض موادها بلا تكلفة بعد.", "Adet maliyeti = etiket + içerik + ambalaj, IQD. * = bazı kalemlerinin henüz maliyeti yok."),
})
group("cost.why", {"label": ("label", "ملصق", "etiket"), "made": ("made of", "مكوّن", "içerik"), "pack": ("packaging", "تغليف", "ambalaj")})
group("history.product", {"cost": ("Cost changed", "تغيير التكلفة", "Maliyet değişti")})
group("wh", {
    "noStickers": ("No labels yet. Add them with New item or Import from Excel.", "لا ملصقات بعد. أضفها عبر مادة جديدة أو الاستيراد من إكسل.", "Henüz etiket yok. Yeni kalem veya Excel'den içe aktararak ekleyin."),
    "noMaterials": ("No raw materials yet. Add them with New item or Import from Excel.", "لا مواد أولية بعد. أضفها عبر مادة جديدة أو الاستيراد من إكسل.", "Henüz hammadde yok. Yeni kalem veya Excel'den içe aktararak ekleyin."),
    "noPackaging": ("No packaging items yet. Add them with New item or Import from Excel.", "لا مواد تغليف بعد. أضفها عبر مادة جديدة أو الاستيراد من إكسل.", "Henüz ambalaj yok. Yeni kalem veya Excel'den içe aktararak ekleyin."),
})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
