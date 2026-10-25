"""Receipts: saved print layouts (banner, fields, columns, language), printing Sell / Buy / payment receipts; phone on Buy/Sell."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("nav", {"receipts": ("Receipts", "الوصولات", "Makbuzlar")})
group("perm.resources", {"receipts": ("Receipts (print layouts)", "الوصولات (تصاميم الطباعة)", "Makbuzlar (baskı düzenleri)")})
group("sd", {"phone": ("Phone", "رقم الهاتف", "Telefon")})
group("rc2", {
    "intro": ("Saved layouts for printing sales, purchases and payment receipts. Print from a sale or purchase with the Print receipt button.", "تصاميم محفوظة لطباعة فواتير البيع والشراء ووصولات القبض. اطبع من فاتورة البيع أو الشراء بزر طباعة الوصل.", "Satış, alış ve tahsilat makbuzları için kayıtlı düzenler. Satış veya alıştan Makbuz yazdır düğmesiyle yazdırın."),
    "new": ("New layout", "تصميم جديد", "Yeni düzen"),
    "none": ("No layouts yet. Receipts print in the standard layout.", "لا توجد تصاميم بعد. تُطبع الوصولات بالتصميم القياسي.", "Henüz düzen yok. Makbuzlar standart düzende yazdırılır."),
    "noneManage": ("No layouts yet. Press New layout to make the first one.", "لا توجد تصاميم بعد. اضغط تصميم جديد لعمل أول تصميم.", "Henüz düzen yok. İlkini yapmak için Yeni düzen'e basın."),
    "saved": ("Layout saved.", "تم حفظ التصميم.", "Düzen kaydedildi."),
    "isDefault": ("Default", "الافتراضي", "Varsayılan"),
    "howToPrint": ("To print: open a sale or purchase (Stock Movements) and press Print receipt, then choose the layout and press Print.", "للطباعة: افتح فاتورة بيع أو شراء (حركات المخزون) واضغط طباعة الوصل، ثم اختر التصميم واضغط طباعة.", "Yazdırmak için: bir satış veya alışı açın (Stok Hareketleri), Makbuz yazdır'a basın, düzeni seçip Yazdır'a basın."),
    "name": ("Layout name", "اسم التصميم", "Düzen adı"),
    "for": ("Used for", "يُستخدم لـ", "Kullanım"),
    "language": ("Receipt language", "لغة الوصل", "Makbuz dili"),
    "paper": ("Paper", "الورق", "Kağıt"),
    "fontSize": ("Text size (pt)", "حجم الخط (pt)", "Yazı boyutu (pt)"),
    "margin": ("Page margin (mm)", "هامش الصفحة (مم)", "Sayfa kenarı (mm)"),
    "color": ("Colour", "اللون", "Renk"),
    "default": ("Use this layout first for this kind of receipt", "استخدم هذا التصميم أولاً لهذا النوع من الوصولات", "Bu tür makbuz için önce bu düzeni kullan"),
    "banner": ("Banner on top", "الشعار في الأعلى", "Üst afiş"),
    "bannerHint": ("Upload the banner picture (PNG or JPG) exactly as it should appear across the top of the receipt.", "حمّل صورة الشعار (PNG أو JPG) كما يجب أن تظهر أعلى الوصل.", "Afiş resmini (PNG veya JPG) makbuzun üstünde görünmesi gerektiği gibi yükleyin."),
    "uploadBanner": ("Upload banner", "تحميل الشعار", "Afiş yükle"),
    "changeBanner": ("Change banner", "تغيير الشعار", "Afişi değiştir"),
    "removeBanner": ("Remove", "إزالة", "Kaldır"),
    "bannerHeight": ("Banner height", "ارتفاع الشعار", "Afiş yüksekliği"),
    "bannerTooBig": ("The picture is too large. Use one under 1 MB.", "الصورة كبيرة جداً. استخدم صورة أقل من 1 ميغابايت.", "Resim çok büyük. 1 MB'den küçük bir resim kullanın."),
    "bannerBad": ("This file isn't a picture the browser can read.", "هذا الملف ليس صورة يمكن قراءتها.", "Bu dosya okunabilen bir resim değil."),
    "showLogo": ("Show the Bereket logo when there is no banner", "اعرض شعار بركة عند عدم وجود بانر", "Afiş yoksa Bereket logosunu göster"),
    "title": ("Title", "العنوان", "Başlık"),
    "titleHint": ("Empty = Sales invoice / Purchase invoice / Payment receipt", "فارغ = فاتورة بيع / فاتورة شراء / وصل قبض", "Boş = Satış faturası / Alış faturası / Tahsilat makbuzu"),
    "header": ("Text under the banner (address, phones…)", "نص تحت الشعار (العنوان، الهواتف…)", "Afişin altındaki yazı (adres, telefonlar…)"),
    "footer": ("Text at the bottom", "نص في الأسفل", "Alttaki yazı"),
    "fields": ("What to show", "ما يظهر في الوصل", "Gösterilecekler"),
    "columns": ("Item table columns", "أعمدة جدول المواد", "Ürün tablosu sütunları"),
    "columnsHint": ("Tick the columns to print and use the arrows to change their order.", "اختر الأعمدة المطبوعة واستخدم الأسهم لتغيير ترتيبها.", "Yazdırılacak sütunları işaretleyin, sırayı oklarla değiştirin."),
    "up": ("up", "للأعلى", "yukarı"),
    "down": ("down", "للأسفل", "aşağı"),
    "sign1": ("First signature box", "خانة التوقيع الأولى", "Birinci imza kutusu"),
    "sign2": ("Second signature box", "خانة التوقيع الثانية", "İkinci imza kutusu"),
    "save": ("Save layout", "حفظ التصميم", "Düzeni kaydet"),
    "delete": ("Delete layout", "حذف التصميم", "Düzeni sil"),
    "previewReal": ("Preview with your latest document {number}", "معاينة بآخر مستند لديك {number}", "Son belgenizle önizleme {number}"),
    "previewSample": ("Preview with sample data", "معاينة ببيانات تجريبية", "Örnek verilerle önizleme"),
    "layout": ("Layout", "التصميم", "Düzen"),
    "standard": ("Standard layout", "التصميم القياسي", "Standart düzen"),
    "print": ("Print / Save as PDF", "طباعة / حفظ PDF", "Yazdır / PDF kaydet"),
    "printReceipt": ("Print receipt", "طباعة الوصل", "Makbuz yazdır"),
    "printShort": ("Print", "طباعة", "Yazdır"),
})
group("rc2.type", {"SELL": ("Sales", "المبيعات", "Satışlar"), "BUY": ("Purchases", "المشتريات", "Alışlar"), "PAYMENT": ("Payment received (later)", "وصل قبض (دفعة لاحقة)", "Tahsilat (sonradan)")})
group("rc2.lang", {"ar": ("Arabic", "العربية", "Arapça"), "en": ("English", "الإنجليزية", "İngilizce"), "tr": ("Turkish", "التركية", "Türkçe"), "ar-en": ("Arabic + English", "العربية + الإنجليزية", "Arapça + İngilizce")})
group("rc2.f", {"date": ("Date", "التاريخ", "Tarih"), "time": ("Time", "الوقت", "Saat"), "number": ("Document number", "رقم المستند", "Belge no"), "invoice": ("Invoice number", "رقم الفاتورة", "Fatura no"),
    "order": ("Order number", "رقم الطلب", "Sipariş no"), "customer": ("Customer / supplier name", "اسم الزبون / المورد", "Müşteri / tedarikçi"), "phone": ("Phone number", "رقم الهاتف", "Telefon"),
    "by": ("Accountant's name", "اسم المحاسب", "Muhasebeci adı"), "note": ("Note", "الملاحظة", "Not"), "paid": ("Paid", "المدفوع", "Ödenen"), "owed": ("Remaining", "المتبقي", "Kalan"),
    "words": ("Total in words", "المبلغ كتابةً", "Yazıyla tutar"), "signatures": ("Signature / stamp boxes", "خانات التوقيع / الختم", "İmza / kaşe kutuları")})
group("rc2.c", {"no": ("Line no.", "التسلسل", "Sıra no"), "code": ("Code", "الرمز", "Kod"), "name": ("Item name", "اسم المادة", "Ürün adı"), "name2": ("Second name", "الاسم الثاني", "İkinci ad"),
    "qty": ("Quantity", "الكمية", "Miktar"), "unit": ("Unit", "الوحدة", "Birim"), "price": ("Price", "السعر", "Fiyat"), "total": ("Total price", "السعر الكلي", "Toplam fiyat")})
group("history.receipt", {"layoutCreate": ("Receipt layout created", "إنشاء تصميم وصل", "Makbuz düzeni oluşturuldu"), "layoutEdit": ("Receipt layout changed", "تعديل تصميم وصل", "Makbuz düzeni değiştirildi"), "layoutDelete": ("Receipt layout deleted", "حذف تصميم وصل", "Makbuz düzeni silindi"), "print": ("Receipt printed", "طباعة وصل", "Makbuz yazdırıldı")})
group("audit.entity", {"ReceiptLayout": ("Receipt layout", "تصميم وصل", "Makbuz düzeni")})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
