"""Bulk master data: products (labels) belong to molds, Excel import, paste labels."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)

group("md", {
    "mold": ("Mold", "القالب", "Kalıp"),
    "labels": ("Labels", "الملصقات", "Etiketler"),
    "labelsN": ("{n} labels", "{n} ملصق", "{n} etiket"),
    "productsN": ("{n} products", "{n} منتج", "{n} ürün"),
    "viewLabels": ("View labels", "عرض الملصقات", "Etiketleri gör"),
    "addLabels": ("Add labels", "إضافة ملصقات", "Etiket ekle"),
    "moldOfProductHint": ("The mold this product is made on. Every label on the same mold is its own product.", "القالب الذي يُصنع عليه هذا المنتج. كل ملصق على نفس القالب منتج مستقل.", "Bu ürünün yapıldığı kalıp. Aynı kalıptaki her etiket ayrı bir üründür."),
    "productNameHint": ("For labelled products: the label name, e.g. “Zakho Water 500 ml”.", "للمنتجات الملصقة: اسم الملصق، مثلاً «مياه زاخو 500 مل».", "Etiketli ürünler için etiket adı, örn. “Zakho Su 500 ml”."),
    "searchProducts": ("Product, label, code or mold…", "منتج، ملصق، رمز أو قالب…", "Ürün, etiket, kod veya kalıp…"),
    "allMolds": ("All molds", "كل القوالب", "Tüm kalıplar"),
    "noMold": ("Without a mold", "بدون قالب", "Kalıpsız"),
    "showingFirst": ("Showing the first {n} of {total}. Choose a mold or search to see the rest.", "يُعرض أول {n} من {total}. اختر قالباً أو ابحث لرؤية الباقي.", "{total} üründen ilk {n} gösteriliyor. Gerisi için kalıp seçin veya arayın."),
    "existingLabels": ("Labels already on this mold", "الملصقات الموجودة على هذا القالب", "Bu kalıptaki etiketler"),
    "noLabelsYet": ("No labels yet.", "لا ملصقات بعد.", "Henüz etiket yok."),
    "pasteLabels": ("Labels — one per line", "الملصقات — واحد في كل سطر", "Etiketler — her satıra bir tane"),
    "pasteLabelsHint": ("Type or paste the label names, one per line (you can copy a whole column from Excel). Codes are given automatically ({code}-001, -002…). To use your own codes, paste two columns: code and name.",
                        "اكتب أو الصق أسماء الملصقات، واحد في كل سطر (يمكنك نسخ عمود كامل من إكسل). تُعطى الرموز تلقائياً ({code}-001، -002…). لاستخدام رموزك، الصق عمودين: الرمز والاسم.",
                        "Etiket adlarını her satıra bir tane yazın veya yapıştırın (Excel'den bütün bir sütunu kopyalayabilirsiniz). Kodlar otomatik verilir ({code}-001, -002…). Kendi kodlarınız için iki sütun yapıştırın: kod ve ad."),
    "sameForAll": ("Optional — applied to every label in this list:", "اختياري — يُطبَّق على كل الملصقات في هذه القائمة:", "İsteğe bağlı — listedeki tüm etiketlere uygulanır:"),
    "saveLabels": ("Save {n} labels", "حفظ {n} ملصق", "{n} etiketi kaydet"),
    "labelsSaved": ("{n} labels saved as products.", "حُفظ {n} ملصق كمنتجات.", "{n} etiket ürün olarak kaydedildi."),
    "labelsSkipped": ("{n} were already there and were skipped.", "{n} موجودة مسبقاً وتم تخطيها.", "{n} tanesi zaten vardı, atlandı."),
})
group("imp", {
    "button": ("Import from Excel", "استيراد من إكسل", "Excel'den içe aktar"),
    "title": ("Import from Excel", "استيراد من إكسل", "Excel'den içe aktar"),
    "subtitle": ("Add or update many machines, molds and products (labels) at once.", "أضف أو حدّث آلات وقوالب ومنتجات (ملصقات) كثيرة دفعة واحدة.", "Birçok makine, kalıp ve ürünü (etiketi) tek seferde ekleyin veya güncelleyin."),
    "step1": ("1. Download the template", "١. نزّل القالب", "1. Şablonu indirin"),
    "step1Hint": ("An Excel file with three sheets: Machines, Molds and Products. Fill it in, or paste your existing lists into it.", "ملف إكسل بثلاث أوراق: Machines و Molds و Products. املأه أو الصق قوائمك الحالية فيه.", "Üç sayfalı bir Excel dosyası: Machines, Molds ve Products. Doldurun veya mevcut listelerinizi yapıştırın."),
    "download": ("Download Excel template", "تنزيل قالب إكسل", "Excel şablonunu indir"),
    "tip1": ("One row per label on the Products sheet, with the mold code.", "صف لكل ملصق في ورقة Products مع رمز القالب.", "Products sayfasında her etiket için bir satır ve kalıp kodu."),
    "tip2": ("Product code can stay empty — it is created automatically from the mold code.", "يمكن ترك رمز المنتج فارغاً — يُنشأ تلقائياً من رمز القالب.", "Ürün kodu boş kalabilir — kalıp kodundan otomatik oluşturulur."),
    "tip3": ("Importing the same file again updates rows instead of making copies.", "استيراد نفس الملف مرة أخرى يحدّث الصفوف بدل تكرارها.", "Aynı dosyayı tekrar içe aktarmak kopya oluşturmaz, satırları günceller."),
    "tip4": ("Nothing is saved until every row is correct.", "لا يُحفظ شيء حتى تكون كل الصفوف صحيحة.", "Tüm satırlar doğru olana kadar hiçbir şey kaydedilmez."),
    "step2": ("2. Upload the filled-in file", "٢. ارفع الملف المملوء", "2. Doldurulmuş dosyayı yükleyin"),
    "choose": ("Choose the Excel or CSV file", "اختر ملف إكسل أو CSV", "Excel veya CSV dosyasını seçin"),
    "check": ("Check file", "فحص الملف", "Dosyayı kontrol et"),
    "reading": ("Reading…", "جارٍ القراءة…", "Okunuyor…"),
    "new": ("New", "جديد", "Yeni"),
    "updated": ("Updated", "محدَّث", "Güncellenen"),
    "unchanged": ("Unchanged", "بدون تغيير", "Değişmeyen"),
    "hasErrors": ("{n} problems found. Fix them in Excel and check the file again — nothing was saved.", "وُجدت {n} مشكلة. صحّحها في إكسل وافحص الملف مجدداً — لم يُحفظ شيء.", "{n} sorun bulundu. Excel'de düzeltip dosyayı tekrar kontrol edin — hiçbir şey kaydedilmedi."),
    "row": ("row {n}", "الصف {n}", "satır {n}"),
    "ready": ("The file is correct.", "الملف صحيح.", "Dosya doğru."),
    "import": ("Import {n} rows", "استيراد {n} صف", "{n} satırı içe aktar"),
    "done": ("Imported. Open:", "تم الاستيراد. افتح:", "İçe aktarıldı. Açın:"),
    "nothing": ("Nothing new to import — everything in the file is already in the system.", "لا جديد للاستيراد — كل ما في الملف موجود في النظام.", "İçe aktarılacak yeni bir şey yok — dosyadaki her şey sistemde zaten var."),
})
group("imp.sheet", {"machines": ("Machines", "الآلات", "Makineler"), "molds": ("Molds", "القوالب", "Kalıplar"), "products": ("Products / labels", "المنتجات / الملصقات", "Ürünler / etiketler")})
group("history.product", {"bulk_create": ("Labels added to a mold", "أُضيفت ملصقات لقالب", "Kalıba etiketler eklendi")})
group("history.masterdata", {"import": ("Imported from Excel", "استيراد من إكسل", "Excel'den içe aktarıldı")})

for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"
    d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d
        parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(p, "a").write("\n")
print(len(S), "strings x 3")
