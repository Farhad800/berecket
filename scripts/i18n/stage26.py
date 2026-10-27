"""Batches (oldest first): each purchase / production run / priced input is a batch with its own cost."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("cost", {
    "title": ("Starting cost", "التكلفة الابتدائية", "Başlangıç maliyeti"),
    "hint": ("Price of one unit, in the currency you paid. For USD or EUR also type today's rate. It is the cost of the stock that was here before batches started, and of stock taken when no batch is left. Every purchase makes its own batch at its own price and rate.",
             "سعر الوحدة بالعملة التي دفعت بها. للدولار أو اليورو اكتب سعر الصرف اليوم أيضاً. هي تكلفة المخزون الموجود قبل بدء الدفعات، وتكلفة ما يؤخذ عندما لا تبقى دفعة. كل شراء يصنع دفعة خاصة بسعرها وسعر صرفها.",
             "Ödediğiniz para biriminde bir birimin fiyatı. USD veya EUR için günün kurunu da yazın. Partiler başlamadan önce depoda olan stokun ve parti kalmadığında alınan stokun maliyetidir. Her alış kendi fiyatı ve kuruyla kendi partisini oluşturur."),
    "productHint": ("For the number of pieces made: the same amounts production takes from stock — full cartons and bags (a started one counts), nylon by its kg — costed from the oldest batches still in stock (then at the latest cost), in IQD.",
                    "لعدد القطع المصنوعة: نفس الكميات التي يأخذها الإنتاج من المخزون — كراتين وأكياس كاملة (المبدوء يُحسب)، والنايلون بالكيلو — محسوبة من أقدم الدفعات الموجودة في المخزون (ثم بآخر تكلفة)، بالدينار.",
                    "Üretilen adet için: üretimin stoktan aldığı aynı miktarlar — tam koliler ve torbalar (başlanan sayılır), naylon kg ile — stoktaki en eski partilerden (sonra son maliyetle) hesaplanır, IQD."),
    "tableHint": ("Cost per unit = the batches still in stock (each at its own cost) ÷ the stock. With no stock: the latest cost. * = some of it has no cost yet.",
                  "التكلفة للوحدة = الدفعات الموجودة في المخزون (كل منها بتكلفتها) ÷ المخزون. بدون مخزون: آخر تكلفة. * = جزء منها بلا تكلفة بعد.",
                  "Birim maliyet = stokta kalan partiler (her biri kendi maliyetiyle) ÷ stok. Stok yoksa: son maliyet. * = bir kısmının henüz maliyeti yok."),
})
group("lot", {
    "title": ("Batches (oldest used first)", "الدفعات (الأقدم تُستخدم أولاً)", "Partiler (önce en eski kullanılır)"),
    "hint": ("Each purchase, production run or priced input is a batch with its own cost in IQD (price × that day's rate). Production, sales and every other way out take from the oldest batch first.",
             "كل شراء أو تشغيلة إنتاج أو إدخال بتكلفة هو دفعة بتكلفتها الخاصة بالدينار (السعر × سعر صرف ذلك اليوم). الإنتاج والبيع وكل خروج آخر يأخذ من أقدم دفعة أولاً.",
             "Her alış, üretim partisi veya maliyetli giriş, IQD cinsinden kendi maliyetine sahip bir partidir (fiyat × o günün kuru). Üretim, satış ve diğer tüm çıkışlar önce en eski partiden alır."),
    "inStock": ("Value of the {qty} in stock", "قيمة {qty} في المخزون", "Stoktaki {qty} değeri"),
    "noCost": ("{qty} without a cost", "{qty} بلا تكلفة", "{qty} maliyetsiz"),
    "none": ("No batches yet.", "لا دفعات بعد.", "Henüz parti yok."),
    "date": ("Date", "التاريخ", "Tarih"),
    "from": ("From", "المصدر", "Kaynak"),
    "qtyIn": ("Came in", "الوارد", "Gelen"),
    "left": ("Left", "المتبقي", "Kalan"),
    "price": ("Price × rate", "السعر × الصرف", "Fiyat × kur"),
    "unitCost": ("Cost / {per} (IQD)", "التكلفة / {per} (دينار)", "Maliyet / {per} (IQD)"),
    "usedUp": ("used up", "نفدت", "bitti"),
    "next": ("used next", "التالية", "sıradaki"),
    "opening": ("Stock on {date} (starting cost)", "المخزون في {date} (التكلفة الابتدائية)", "{date} stoku (başlangıç maliyeti)"),
    "production": ("Production {day} · shift {shift}", "إنتاج {day} · وردية {shift}", "Üretim {day} · vardiya {shift}"),
    "productionGone": ("Production (entry removed)", "إنتاج (القيد محذوف)", "Üretim (kayıt silindi)"),
    "runCost": ("Real cost: {piece} IQD / pc · run {run} IQD", "التكلفة الفعلية: {piece} دينار / قطعة · التشغيلة {run} دينار", "Gerçek maliyet: {piece} IQD / adet · parti {run} IQD"),
    "inputCurrency": ("Cost currency (optional)", "عملة التكلفة (اختياري)", "Maliyet para birimi (isteğe bağlı)"),
    "inputHint": ("Type a cost per line to make it a batch at that cost; empty lines use the item's starting cost.", "اكتب تكلفة لكل سطر لتصبح دفعة بتلك التكلفة؛ الأسطر الفارغة تستخدم التكلفة الابتدائية للمادة.", "Bir satıra maliyet yazarsanız o maliyetle bir parti olur; boş satırlar malzemenin başlangıç maliyetini kullanır."),
    "costPerUnit": ("Cost per unit", "التكلفة للوحدة", "Birim maliyet"),
    "startingPh": ("starting cost", "التكلفة الابتدائية", "başlangıç maliyeti"),
    "startingCost": ("starting cost", "التكلفة الابتدائية", "başlangıç maliyeti"),
})
group("lot.src", {
    "BUY": ("Purchase", "شراء", "Alış"), "INPUT": ("Input", "إدخال", "Giriş"), "RETURN": ("Given back from production", "مُرجع من الإنتاج", "Üretimden iade"),
    "OTHER": ("Added (starting cost)", "مضاف (التكلفة الابتدائية)", "Eklendi (başlangıç maliyeti)"), "OPENING": ("Opening stock", "المخزون الافتتاحي", "Açılış stoku"),
    "PRODUCTION": ("Production", "إنتاج", "Üretim"), "SHORT": ("Taken with no stock", "مأخوذ بدون مخزون", "Stoksuz alındı"),
})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
