"""Push notifications: device on/off UI + translated notification texts (nt.<type>)."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
def nt(t, title, body=None):
    add(f"nt.{t}.title", *title)
    if body: add(f"nt.{t}.body", *body)

group("push", {
    "askTitle": ("Get notifications on this device", "تلقَّ الإشعارات على هذا الجهاز", "Bu cihazda bildirim alın"),
    "askBody": ("New orders, production, QC results, stock and breakdowns will pop up even when the app is closed.", "ستظهر الطلبات الجديدة والإنتاج ونتائج الجودة والمخزون والأعطال حتى عندما يكون التطبيق مغلقاً.", "Yeni siparişler, üretim, KK sonuçları, stok ve arızalar uygulama kapalıyken bile görünür."),
    "turnOn": ("Turn on notifications", "تفعيل الإشعارات", "Bildirimleri aç"),
    "turnOff": ("Turn off on this device", "إيقاف على هذا الجهاز", "Bu cihazda kapat"),
    "later": ("Not now", "ليس الآن", "Şimdi değil"),
    "thisDevice": ("Notifications on this device", "الإشعارات على هذا الجهاز", "Bu cihazdaki bildirimler"),
    "on": ("On", "مفعّلة", "Açık"),
    "off": ("Off", "متوقفة", "Kapalı"),
    "explain": ("Pop-up notifications, also when the app or browser is closed.", "إشعارات منبثقة حتى عندما يكون التطبيق أو المتصفح مغلقاً.", "Uygulama veya tarayıcı kapalıyken de açılır bildirimler."),
    "devicesN": ("Turned on for you on {n} device(s).", "مفعّلة لك على {n} جهاز.", "Sizin için {n} cihazda açık."),
    "test": ("Send a test", "إرسال تجربة", "Test gönder"),
    "testTitle": ("Bereket FMS test", "تجربة نظام بركة", "Bereket FMS testi"),
    "testBody": ("Notifications work on this device.", "الإشعارات تعمل على هذا الجهاز.", "Bildirimler bu cihazda çalışıyor."),
    "testSent": ("Test sent — it should pop up in a few seconds.", "أُرسلت التجربة — ستظهر خلال ثوانٍ.", "Test gönderildi — birkaç saniye içinde görünmeli."),
    "nowOn": ("Done — this device will now get notifications.", "تم — سيتلقى هذا الجهاز الإشعارات الآن.", "Tamam — bu cihaz artık bildirim alacak."),
    "dismissed": ("The browser's question was closed without an answer. Press the button again and choose Allow.", "أُغلق سؤال المتصفح دون إجابة. اضغط الزر مجدداً واختر «سماح».", "Tarayıcının sorusu cevapsız kapatıldı. Düğmeye tekrar basıp İzin ver'i seçin."),
    "failed": ("Couldn't turn notifications on. Try again.", "تعذّر تفعيل الإشعارات. حاول مجدداً.", "Bildirimler açılamadı. Tekrar deneyin."),
    "blocked": ("Notifications are blocked for this site. Open the browser's site settings (the lock icon next to the address), set Notifications to Allow, then reload. On Android you can also check Settings → Apps → Chrome → Notifications.",
                "الإشعارات محظورة لهذا الموقع. افتح إعدادات الموقع في المتصفح (رمز القفل بجانب العنوان) واجعل الإشعارات «سماح» ثم أعد التحميل. على أندرويد تحقق أيضاً من الإعدادات ← التطبيقات ← Chrome ← الإشعارات.",
                "Bu site için bildirimler engelli. Tarayıcının site ayarlarını açın (adresin yanındaki kilit simgesi), Bildirimler'i İzin ver yapın ve yenileyin. Android'de Ayarlar → Uygulamalar → Chrome → Bildirimler'i de kontrol edin."),
    "iosInstall": ("On iPhone, notifications work only from the installed app: tap Share → Add to Home Screen, open Bereket FMS from the home screen, then turn notifications on here.",
                   "على الآيفون تعمل الإشعارات فقط من التطبيق المثبّت: اضغط مشاركة ← إضافة إلى الشاشة الرئيسية، افتح Bereket FMS من الشاشة الرئيسية ثم فعّل الإشعارات هنا.",
                   "iPhone'da bildirimler yalnızca yüklü uygulamada çalışır: Paylaş → Ana Ekrana Ekle'ye dokunun, Bereket FMS'i ana ekrandan açın ve bildirimleri burada açın."),
    "unsupported": ("This browser can't receive push notifications. Use Chrome, Edge, Firefox or Safari (installed app on iPhone).", "هذا المتصفح لا يدعم الإشعارات. استخدم Chrome أو Edge أو Firefox أو Safari (التطبيق المثبّت على الآيفون).", "Bu tarayıcı bildirim alamaz. Chrome, Edge, Firefox veya Safari (iPhone'da yüklü uygulama) kullanın."),
    "notConfigured": ("Push notifications aren't set up on the server yet.", "الإشعارات غير مهيأة على الخادم بعد.", "Bildirimler sunucuda henüz ayarlanmadı."),
})

BY = ("by {by}", "بواسطة {by}", "{by} tarafından")
nt("order.new", ("New order {number}", "طلب جديد {number}", "Yeni sipariş {number}"), ("{products} products · {pcs} pcs · by {by}", "{products} منتج · {pcs} قطعة · بواسطة {by}", "{products} ürün · {pcs} adet · {by}"))
nt("order.changed", ("Order {number} changed", "تم تعديل الطلب {number}", "{number} siparişi değişti"), ("Now {products} products · {pcs} pcs · by {by}", "الآن {products} منتج · {pcs} قطعة · بواسطة {by}", "Şimdi {products} ürün · {pcs} adet · {by}"))
nt("order.completed", ("Order {number} completed", "اكتمل الطلب {number}", "{number} siparişi tamamlandı"), BY)
nt("order.cancelled", ("Order {number} cancelled", "أُلغي الطلب {number}", "{number} siparişi iptal edildi"), ("{reason} · by {by}", "{reason} · بواسطة {by}", "{reason} · {by}"))
nt("order.reopened", ("Order {number} reopened", "أُعيد فتح الطلب {number}", "{number} siparişi yeniden açıldı"), ("{reason} · by {by}", "{reason} · بواسطة {by}", "{reason} · {by}"))
nt("order.deleted", ("Order {number} deleted", "حُذف الطلب {number}", "{number} siparişi silindi"), ("{reason} · by {by}", "{reason} · بواسطة {by}", "{reason} · {by}"))
nt("production.saved", ("Production entered: {pcs} pcs", "أُدخل إنتاج: {pcs} قطعة", "Üretim girildi: {pcs} adet"), ("{products} products · {day} · shift {shift} · by {by}", "{products} منتج · {day} · وردية {shift} · بواسطة {by}", "{products} ürün · {day} · vardiya {shift} · {by}"))
nt("production.corrected", ("Production corrected: {product}", "تصحيح إنتاج: {product}", "Üretim düzeltildi: {product}"), ("{before} → {after} pcs · {day} shift {shift} · {reason} · by {by}", "{before} ← {after} قطعة · {day} وردية {shift} · {reason} · بواسطة {by}", "{before} → {after} adet · {day} vardiya {shift} · {reason} · {by}"))
nt("production.deleted", ("Production entry deleted: {product}", "حُذف إدخال إنتاج: {product}", "Üretim girişi silindi: {product}"), ("{before} pcs · {day} shift {shift} · {reason} · by {by}", "{before} قطعة · {day} وردية {shift} · {reason} · بواسطة {by}", "{before} adet · {day} vardiya {shift} · {reason} · {by}"))
nt("qc.approved", ("QC approved {product}", "الجودة قبلت {product}", "KK onayladı: {product}"), ("{day} · shift {shift} · by {by}", "{day} · وردية {shift} · بواسطة {by}", "{day} · vardiya {shift} · {by}"))
nt("qc.rejected", ("QC rejected {pcs} pcs of {product}", "الجودة رفضت {pcs} قطعة من {product}", "KK {product} ürününden {pcs} adet reddetti"), ("{day} · shift {shift} · removed from stock · by {by}", "{day} · وردية {shift} · أُزيلت من المخزون · بواسطة {by}", "{day} · vardiya {shift} · stoktan düşüldü · {by}"))
nt("qc.issue", ("Quality issue {number}: {defect} on {product}", "مشكلة جودة {number}: {defect} في {product}", "Kalite sorunu {number}: {product} üzerinde {defect}"), ("{entry} · {text}", "{entry} · {text}", "{entry} · {text}"))
nt("qc.critical", ("CRITICAL quality issue {number}: {defect} on {product}", "مشكلة جودة حرجة {number}: {defect} في {product}", "KRİTİK kalite sorunu {number}: {product} üzerinde {defect}"), ("{entry} · {text}", "{entry} · {text}", "{entry} · {text}"))
nt("qc.verify", ("{number} is ready for QC verification", "{number} جاهزة لتحقق الجودة", "{number} KK doğrulaması için hazır"), ("{product} · by {by}", "{product} · بواسطة {by}", "{product} · {by}"))
nt("stock.out", ("Goods out: {pcs} pcs", "إخراج بضاعة: {pcs} قطعة", "Mal çıkışı: {pcs} adet"), ("{products} products · {ref} · by {by}", "{products} منتج · {ref} · بواسطة {by}", "{products} ürün · {ref} · {by}"))
nt("stock.adjusted", ("Stock adjusted: {product} {qty}", "تسوية مخزون: {product} {qty}", "Stok düzeltildi: {product} {qty}"), ("{reason} · by {by}", "{reason} · بواسطة {by}", "{reason} · {by}"))
for kind, (en, ar, tr) in {"product": ("Product", "منتج", "Ürün"), "machine": ("Machine", "آلة", "Makine"), "mold": ("Mold", "قالب", "Kalıp")}.items():
    nt(f"{kind}.added", (f"New {en.lower()}: {{name}}", f"{ar} جديد: {{name}}" if kind != "machine" else "آلة جديدة: {name}", f"Yeni {tr.lower()}: {{name}}"), ("{code} · by {by}", "{code} · بواسطة {by}", "{code} · {by}"))
    nt(f"{kind}.removed", (f"{en} deleted: {{name}}", f"حُذف {ar}: {{name}}" if kind != "machine" else "حُذفت آلة: {name}", f"{tr} silindi: {{name}}"), ("{code} · by {by}", "{code} · بواسطة {by}", "{code} · {by}"))
    nt(f"{kind}.archived", (f"{en} archived: {{name}}", f"أُرشف {ar}: {{name}}" if kind != "machine" else "أُرشفت آلة: {name}", f"{tr} arşivlendi: {{name}}"), ("{code} · by {by}", "{code} · بواسطة {by}", "{code} · {by}"))
    nt(f"{kind}.restored", (f"{en} restored: {{name}}", f"أُعيد {ar}: {{name}}" if kind != "machine" else "أُعيدت آلة: {name}", f"{tr} geri alındı: {{name}}"), ("{code} · by {by}", "{code} · بواسطة {by}", "{code} · {by}"))
nt("labels.added", ("{n} labels added to mold {mold}", "أُضيف {n} ملصق إلى القالب {mold}", "{mold} kalıbına {n} etiket eklendi"), BY)
nt("masterdata.imported", ("Excel import: {products} products, {molds} molds, {machines} machines", "استيراد إكسل: {products} منتج، {molds} قالب، {machines} آلة", "Excel içe aktarma: {products} ürün, {molds} kalıp, {machines} makine"), BY)
nt("maintenance.new", ("{number}: {machine} — {problem}", "{number}: {machine} — {problem}", "{number}: {machine} — {problem}"), ("New maintenance request · by {by}", "طلب صيانة جديد · بواسطة {by}", "Yeni bakım talebi · {by}"))
nt("maintenance.newDown", ("Machine {machine} is DOWN — {problem}", "الآلة {machine} متوقفة — {problem}", "{machine} makinesi ARIZALI — {problem}"), ("{number} · by {by}", "{number} · بواسطة {by}", "{number} · {by}"))
nt("maintenance.completed", ("{number} repair completed", "اكتمل إصلاح {number}", "{number} onarımı tamamlandı"), ("{problem} — {text}", "{problem} — {text}", "{problem} — {text}"))
nt("maintenance.ready", ("{machine} is ready to run again", "{machine} جاهزة للعمل مجدداً", "{machine} yeniden çalışmaya hazır"), ("{number} · {text}", "{number} · {text}", "{number} · {text}"))
nt("maintenance.verify", ("{number} is waiting for verification", "{number} بانتظار التحقق", "{number} doğrulama bekliyor"), ("{machine} · {problem}", "{machine} · {problem}", "{machine} · {problem}"))
nt("maintenance.reopened", ("{number} reopened", "أُعيد فتح {number}", "{number} yeniden açıldı"), ("{machine} · {text} · by {by}", "{machine} · {text} · بواسطة {by}", "{machine} · {text} · {by}"))
nt("maintenance.assigned", ("{number} assigned to you", "أُسند إليك {number}", "{number} size atandı"), ("{problem} · by {by}", "{problem} · بواسطة {by}", "{problem} · {by}"))
nt("service.report", ("Service report {number}: {machine}", "تقرير خدمة {number}: {machine}", "Servis raporu {number}: {machine}"), ("{work} · by {by}", "{work} · بواسطة {by}", "{work} · {by}"))

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
