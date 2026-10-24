"""Stickers and materials in the warehouse; second item name."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("wh.tab", {"stock": ("Products", "المنتجات", "Ürünler"), "stickers": ("Stickers", "الملصقات", "Etiketler"), "materials": ("Materials", "المواد", "Malzemeler")})
group("wh.mv", {"RECEIVE": ("Received", "استلام", "Giriş"), "USE": ("Used", "استخدام", "Kullanım")})
group("wh", {
    "receiveMode": ("Received (in)", "استلام (داخل)", "Giriş"),
    "useMode": ("Used (out)", "استخدام (خارج)", "Kullanım (çıkış)"),
    "filterItems": ("Filter by name or code…", "تصفية بالاسم أو الرمز…", "Ada veya koda göre süz…"),
    "onlyInStock": ("Only items in stock", "فقط الموجود في المخزون", "Yalnızca stokta olanlar"),
    "receivedSaved": ("Saved: {n} items received.", "تم الحفظ: استلام {n} مادة.", "Kaydedildi: {n} kalem giriş."),
    "usedSaved": ("Saved: {n} items used.", "تم الحفظ: استخدام {n} مادة.", "Kaydedildi: {n} kalem kullanıldı."),
    "item": ("Item", "المادة", "Kalem"),
    "received": ("Received", "المستلم", "Gelen"),
    "used": ("Used", "المستخدم", "Kullanılan"),
    "receiveRefHint": ("e.g. supplier, invoice number", "مثلاً المورد أو رقم الفاتورة", "örn. tedarikçi, fatura no"),
    "useRefHint": ("e.g. machine, order or person", "مثلاً الآلة أو الطلب أو الشخص", "örn. makine, sipariş veya kişi"),
    "saveReceive": ("Save receipt · {n} items", "حفظ الاستلام · {n} مادة", "Girişi kaydet · {n} kalem"),
    "saveUse": ("Save use · {n} items", "حفظ الاستخدام · {n} مادة", "Kullanımı kaydet · {n} kalem"),
    "itemsN": ("Items", "المواد", "Kalemler"),
    "withStock": ("Items in stock", "مواد في المخزون", "Stoktaki kalemler"),
    "totalKg": ("Total in kg", "المجموع بالكيلو", "Toplam kg"),
    "noStickers": ("No stickers yet. Add them with Import from Excel.", "لا ملصقات بعد. أضفها عبر الاستيراد من إكسل.", "Henüz etiket yok. Excel'den içe aktararak ekleyin."),
    "noMaterials": ("No materials yet. Add them with Import from Excel.", "لا مواد بعد. أضفها عبر الاستيراد من إكسل.", "Henüz malzeme yok. Excel'den içe aktararak ekleyin."),
    "ledgerNote": ("Products go up from daily production; stickers and materials go up when received. Everything goes down when used, taken out or rejected. Totals can't be typed in.", "تزيد المنتجات من الإنتاج اليومي، والملصقات والمواد عند الاستلام. وينقص كل شيء عند الاستخدام أو الإخراج أو الرفض. لا يمكن كتابة المجاميع يدوياً.", "Ürünler günlük üretimle, etiket ve malzemeler girişle artar. Kullanım, çıkış veya redde azalır. Toplamlar elle girilemez."),
})
group("md", {"name2": ("Second name (Turkish / English)", "الاسم الثاني (تركي / إنجليزي)", "İkinci ad (Türkçe / İngilizce)"), "name2Hint": ("Shown under the main name.", "يظهر تحت الاسم الرئيسي.", "Ana adın altında gösterilir.")})
group("history.stock", {"receive": ("Stickers / materials received", "استلام ملصقات / مواد", "Etiket / malzeme girişi"), "use": ("Stickers / materials used", "استخدام ملصقات / مواد", "Etiket / malzeme kullanımı")})
def nt(t, title, body):
    add(f"nt.{t}.title", *title); add(f"nt.{t}.body", *body)
B=("{ref} · by {by}", "{ref} · بواسطة {by}", "{ref} · {by}")
nt("stock.stickersIn", ("Stickers received: {n} items", "استلام ملصقات: {n} مادة", "Etiket girişi: {n} kalem"), B)
nt("stock.materialsIn", ("Materials received: {n} items", "استلام مواد: {n} مادة", "Malzeme girişi: {n} kalem"), B)
nt("stock.stickersUsed", ("Stickers used: {n} items", "استخدام ملصقات: {n} مادة", "Etiket kullanımı: {n} kalem"), B)
nt("stock.materialsUsed", ("Materials used: {n} items", "استخدام مواد: {n} مادة", "Malzeme kullanımı: {n} kalem"), B)
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
