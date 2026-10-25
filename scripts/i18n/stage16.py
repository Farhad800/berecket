"""Stock movements section: Input / Output / Buy / Sell documents; read-only warehouse."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("nav", {"stock": ("Stock Movements", "حركات المخزون", "Stok Hareketleri")})
group("perm.actions", {"input": ("Input", "إدخال", "Giriş"), "output": ("Output", "إخراج", "Çıkış"), "buy": ("Buy", "شراء", "Alış"), "sell": ("Sell", "بيع", "Satış")})
group("perm.resources", {"stock": ("Stock movements", "حركات المخزون", "Stok hareketleri")})
group("wh", {"readOnlyNote": ("Stock on hand. It changes only through Stock Movements (input, output, buy, sell) and daily production.", "المخزون الموجود. يتغير فقط عبر حركات المخزون (إدخال، إخراج، شراء، بيع) والإنتاج اليومي.", "Eldeki stok. Yalnızca Stok Hareketleri (giriş, çıkış, alış, satış) ve günlük üretimle değişir.")})
group("wh.mv", {"INPUT": ("Input", "إدخال", "Giriş"), "OUTPUT": ("Output", "إخراج", "Çıkış"), "BUY": ("Bought", "شراء", "Alış"), "SELL": ("Sold", "بيع", "Satış"), "USE": ("Used by production", "استُخدم في الإنتاج", "Üretimde kullanıldı")})
group("sd", {
    "intro": ("Every manual change of stock: input, output, buy and sell. Production and what it uses still change stock automatically.", "كل تغيير يدوي للمخزون: إدخال وإخراج وشراء وبيع. الإنتاج وما يستخدمه يغيّران المخزون تلقائياً كما هو.", "Stoktaki her elle değişiklik: giriş, çıkış, alış ve satış. Üretim ve kullandıkları stoğu yine otomatik değiştirir."),
    "search": ("Number, supplier/customer, invoice or item…", "الرقم، المورد/الزبون، الفاتورة أو المادة…", "Numara, tedarikçi/müşteri, fatura veya kalem…"),
    "allTypes": ("All types", "كل الأنواع", "Tüm türler"),
    "none": ("No stock movements yet.", "لا حركات مخزون بعد.", "Henüz stok hareketi yok."),
    "linesN": ("{n} items", "{n} مادة", "{n} kalem"),
    "invoice": ("Invoice", "الفاتورة", "Fatura"),
    "newTitle": ("New stock movement", "حركة مخزون جديدة", "Yeni stok hareketi"),
    "reasonLabel": ("Reason", "السبب", "Neden"),
    "supplier": ("Supplier", "المورد", "Tedarikçi"),
    "customer": ("Customer", "الزبون", "Müşteri"),
    "currency": ("Currency", "العملة", "Para birimi"),
    "iqd": ("Iraqi dinar", "دينار عراقي", "Irak dinarı"),
    "usd": ("US dollar", "دولار أمريكي", "ABD doları"),
    "order": ("Order (optional)", "الطلب (اختياري)", "Sipariş (isteğe bağlı)"),
    "noOrder": ("— not for an order —", "— ليس لطلب —", "— siparişe bağlı değil —"),
    "fillFromOrder": ("Fill the lines from this order", "املأ الأسطر من هذا الطلب", "Satırları bu siparişten doldur"),
    "fillHint": ("The list button fills the lines with the order's products.", "زر القائمة يملأ الأسطر بمنتجات الطلب.", "Liste düğmesi satırları siparişin ürünleriyle doldurur."),
    "note": ("Note", "ملاحظة", "Not"),
    "unitPrice": ("Price per unit", "سعر الوحدة", "Birim fiyat"),
    "lineTotal": ("Total", "المجموع", "Toplam"),
    "total": ("Total", "المجموع", "Toplam"),
    "addLine": ("Add item", "إضافة مادة", "Kalem ekle"),
    "willGoMinus": ("stock will go below zero", "سيصبح المخزون تحت الصفر", "stok sıfırın altına düşecek"),
    "saved": ("{number} saved. Stock has been updated.", "حُفظ {number}. تم تحديث المخزون.", "{number} kaydedildi. Stok güncellendi.") ,
    "minusNow": ("Below zero now: {items}. Check the count.", "تحت الصفر الآن: {items}. تحقق من العدّ.", "Şu an sıfırın altında: {items}. Sayımı kontrol edin."),
    "stockNow": ("Stock now", "المخزون الآن", "Şu anki stok"),
    "viewDoc": ("View document", "عرض المستند", "Belgeyi gör"),
    "sold": ("Sold", "المُباع", "Satılan"),
    "salesForOrder": ("Sales for this order", "المبيعات لهذا الطلب", "Bu siparişin satışları"),
    "noSales": ("Nothing sold for this order yet.", "لم يُبع شيء لهذا الطلب بعد.", "Bu sipariş için henüz satış yok."),
})
group("sd.type", {"INPUT": ("Input", "إدخال", "Giriş"), "OUTPUT": ("Output", "إخراج", "Çıkış"), "BUY": ("Buy", "شراء", "Alış"), "SELL": ("Sell", "بيع", "Satış")})
group("sd.new", {"INPUT": ("Input", "إدخال", "Giriş"), "OUTPUT": ("Output", "إخراج", "Çıkış"), "BUY": ("Buy", "شراء", "Alış"), "SELL": ("Sell", "بيع", "Satış")})
group("sd.save", {"INPUT": ("Save input", "حفظ الإدخال", "Girişi kaydet"), "OUTPUT": ("Save output", "حفظ الإخراج", "Çıkışı kaydet"), "BUY": ("Save purchase", "حفظ الشراء", "Alışı kaydet"), "SELL": ("Save sale", "حفظ البيع", "Satışı kaydet")})
group("sd.help", {
    "INPUT": ("Items coming in without money: returns, transfers, count corrections.", "مواد داخلة بدون مال: مرتجعات، تحويلات، تصحيح عدّ.", "Parasız giren kalemler: iadeler, transferler, sayım düzeltmeleri."),
    "OUTPUT": ("Items going out without money: damage, samples, transfers, count corrections.", "مواد خارجة بدون مال: تالف، عينات، تحويلات، تصحيح عدّ.", "Parasız çıkan kalemler: hasar, numune, transfer, sayım düzeltmeleri."),
    "BUY": ("Items bought from a supplier, with the price in IQD or USD.", "مواد مشتراة من مورد مع السعر بالدينار أو الدولار.", "Tedarikçiden alınan kalemler, IQD veya USD fiyatla."),
    "SELL": ("Items sold to a customer, with the price in IQD or USD. Link it to an order if there is one.", "مواد مباعة لزبون مع السعر بالدينار أو الدولار. اربطه بطلب إن وجد.", "Müşteriye satılan kalemler, IQD veya USD fiyatla. Varsa bir siparişe bağlayın."),
})
group("sd.reason", {"RETURN": ("Return", "مرتجع", "İade"), "TRANSFER": ("Transfer", "تحويل", "Transfer"), "COUNT": ("Count correction", "تصحيح عدّ", "Sayım düzeltmesi"), "DAMAGE": ("Damage / scrap", "تالف / خردة", "Hasar / hurda"), "SAMPLE": ("Sample", "عينة", "Numune"), "OTHER": ("Other", "أخرى", "Diğer")})
group("search", {"hint": ("Find any order, product, label, material, machine, mold, quality issue, maintenance request or stock movement.", "ابحث عن أي طلب أو منتج أو ملصق أو مادة أو آلة أو قالب أو مشكلة جودة أو طلب صيانة أو حركة مخزون.", "Herhangi bir sipariş, ürün, etiket, malzeme, makine, kalıp, kalite sorunu, bakım talebi veya stok hareketi bulun.")})
group("search.kind", {"orders": ("Orders", "الطلبات", "Siparişler"), "products": ("Products & items", "المنتجات والمواد", "Ürünler ve kalemler"), "stockDocs": ("Stock movements", "حركات المخزون", "Stok hareketleri")})
group("rep.r.trade", {"title": ("Buying and selling", "الشراء والبيع", "Alış ve satış"), "desc": ("Every bought and sold item with supplier/customer, price and total in IQD or USD.", "كل مادة مشتراة ومباعة مع المورد/الزبون والسعر والمجموع بالدينار أو الدولار.", "Alınan ve satılan her kalem: tedarikçi/müşteri, fiyat ve toplam (IQD veya USD).")})
group("rep.col", {"document": ("Document", "المستند", "Belge"), "party": ("Supplier / customer", "المورد / الزبون", "Tedarikçi / müşteri"), "invoice": ("Invoice", "الفاتورة", "Fatura"), "unitPrice": ("Price", "السعر", "Fiyat"), "amount": ("Amount", "المبلغ", "Tutar"), "currency": ("Currency", "العملة", "Para birimi")})
group("rep.kpi", {"boughtIqd": ("Bought (IQD)", "المشتريات (دينار)", "Alış (IQD)"), "boughtUsd": ("Bought (USD)", "المشتريات (دولار)", "Alış (USD)"), "soldIqd": ("Sold (IQD)", "المبيعات (دينار)", "Satış (IQD)"), "soldUsd": ("Sold (USD)", "المبيعات (دولار)", "Satış (USD)")})
group("history.stock", {"input": ("Stock input", "إدخال مخزون", "Stok girişi"), "output": ("Stock output", "إخراج مخزون", "Stok çıkışı"), "buy": ("Purchase", "شراء", "Alış"), "sell": ("Sale", "بيع", "Satış")})
group("audit.entity", {"StockDoc": ("Stock movement", "حركة مخزون", "Stok hareketi")})
def nt(t, title, body):
    add(f"nt.{t}.title", *title); add(f"nt.{t}.body", *body)
nt("stock.docINPUT", ("Stock input {number}: {n} items", "إدخال مخزون {number}: {n} مادة", "Stok girişi {number}: {n} kalem"), ("by {by}", "بواسطة {by}", "{by}"))
nt("stock.docOUTPUT", ("Stock output {number}: {n} items", "إخراج مخزون {number}: {n} مادة", "Stok çıkışı {number}: {n} kalem"), ("by {by}", "بواسطة {by}", "{by}"))
nt("stock.docBUY", ("Bought {number}: {n} items · {total}", "شراء {number}: {n} مادة · {total}", "Alış {number}: {n} kalem · {total}"), ("from {party} · by {by}", "من {party} · بواسطة {by}", "{party} firmasından · {by}"))
nt("stock.docSELL", ("Sold {number}: {n} items · {total}", "بيع {number}: {n} مادة · {total}", "Satış {number}: {n} kalem · {total}"), ("to {party} · by {by}", "إلى {party} · بواسطة {by}", "{party} müşterisine · {by}"))
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
