"""Remove all items before importing a corrected list."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("sys", {
    "itemsTitle": ("Replace the item list", "استبدال قائمة المواد", "Kalem listesini değiştir"),
    "itemsIntro": ("Removes every product, sticker and material so a corrected Excel list can be imported in their place. Machines, molds, employees and the audit log stay.", "يحذف كل المنتجات والملصقات والمواد لاستيراد قائمة إكسل مصححة مكانها. تبقى الآلات والقوالب والموظفون وسجل التدقيق.", "Düzeltilmiş Excel listesi içe aktarılabilsin diye tüm ürün, etiket ve malzemeleri siler. Makineler, kalıplar, çalışanlar ve denetim kaydı kalır."),
    "itemsWarning": ("This can't be undone. Keep the Excel file so you can import it again.", "لا يمكن التراجع. احتفظ بملف الإكسل لتستورده مجدداً.", "Geri alınamaz. Tekrar içe aktarmak için Excel dosyasını saklayın."),
    "typeDeleteItems": ("Type DELETE ITEMS to confirm", "اكتب DELETE ITEMS للتأكيد", "Onaylamak için DELETE ITEMS yazın"),
    "itemsButton": ("Remove all {n} items", "حذف كل المواد ({n})", "Tüm {n} kalemi sil"),
    "itemsDone": ("{n} items removed. Now import the new list:", "حُذفت {n} مادة. استورد القائمة الجديدة الآن:", "{n} kalem silindi. Şimdi yeni listeyi içe aktarın:"),
    "itemsImportNow": ("Import from Excel", "الاستيراد من إكسل", "Excel'den içe aktar"),
    "itemsUsed": ("{n} items are already used by orders, production or stock, so the list can't be removed. Clear the test transactions first (above).", "{n} مادة مستخدمة في طلبات أو إنتاج أو مخزون، لذا لا يمكن حذف القائمة. امسح معاملات التجربة أولاً (أعلاه).", "{n} kalem sipariş, üretim veya stokta kullanılıyor; liste silinemez. Önce test işlemlerini temizleyin (yukarıda)."),
})
group("sys.items", {"products": ("Products", "المنتجات", "Ürünler"), "stickers": ("Stickers", "الملصقات", "Etiketler"), "materials": ("Materials", "المواد", "Malzemeler")})
group("history.system", {"remove_items": ("All items removed", "حُذفت كل المواد", "Tüm kalemler silindi")})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
