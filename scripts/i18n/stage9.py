"""Redesign: simple orders (product sheet), daily production entries, stock-only warehouse, no customers."""
import json
S = {}
DROP = ["status.order", "status.job", "status.qc", "status.stock", "status.ship", "wh.mv", "wh.tab", "order.act", "ship",
        "nav.schedule", "nav.shipments", "nav.customers", "daily.colJob", "daily.colProgress", "daily.newBatch", "daily.none",
        "daily.started", "daily.notSaved", "daily.finished", "daily.completed", "daily.willStart", "daily.machineDown", "daily.todaySoFar",
        "rep.r.planned-vs-actual", "rep.r.order-completion", "rep.r.on-time", "rep.r.delayed", "rep.r.outstanding", "rep.r.downtime",
        "rep.r.receipts", "rep.r.shipments", "dashboard.activeOrders", "dashboard.dueToday", "dashboard.overdue", "dashboard.urgent",
        "dashboard.scheduledToday", "dashboard.inProduction", "dashboard.awaitingQc", "dashboard.awaitingReceipt",
        "dashboard.availableStock", "dashboard.shipmentsToday", "dashboard.partiallyDelivered", "sys.count.jobs", "sys.count.batches",
        "sys.count.downtime", "sys.count.receipts", "sys.count.shipments", "audit.entity.ProductionJob", "audit.entity.Batch",
        "audit.entity.Shipment", "audit.entity.WarehouseReceipt", "audit.entity.StorageLocation", "audit.entity.Customer"]


def add(path, en, ar, tr): S[path] = (en, ar, tr)


def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)


group("nav", {
    "orders": ("Orders", "الطلبات", "Siparişler"),
    "production": ("Daily Production", "الإنتاج اليومي", "Günlük Üretim"),
    "inventory": ("Warehouse Stock", "مخزون المستودع", "Depo Stoku"),
    "sales": ("Sales", "المبيعات", "Satış"),
})
group("status.order", {
    "OPEN": ("Open", "مفتوح", "Açık"),
    "COMPLETED": ("Completed", "مكتمل", "Tamamlandı"),
    "CANCELLED": ("Cancelled", "ملغى", "İptal"),
})
group("status.entryQc", {
    "NOT_INSPECTED": ("Not inspected", "لم يُفحص", "Muayene edilmedi"),
    "APPROVED": ("Approved", "مقبول", "Onaylandı"),
    "REJECTED": ("Rejected", "مرفوض", "Reddedildi"),
})
group("wh.mv", {
    "PRODUCTION": ("Produced", "إنتاج", "Üretim"),
    "QC_REJECT": ("QC rejected", "رفض الجودة", "KK reddi"),
    "OUT": ("Out", "إخراج", "Çıkış"),
    "ADJUST": ("Adjustment", "تسوية", "Düzeltme"),
})
group("wh.tab", {
    "stock": ("Stock", "المخزون", "Stok"),
    "movements": ("Movements", "الحركات", "Hareketler"),
})
group("wh", {
    "ledgerNote": ("Stock goes up automatically from daily production and down when QC rejects or goods go out. Totals can't be typed in.",
                   "يزيد المخزون تلقائياً من الإنتاج اليومي وينقص عند رفض الجودة أو إخراج البضاعة. لا يمكن كتابة المجاميع يدوياً.",
                   "Stok günlük üretimle otomatik artar, KK reddinde veya mal çıkışında azalır. Toplamlar elle girilemez."),
    "totalPieces": ("Pieces in stock", "القطع في المخزون", "Stoktaki adet"),
    "productsInStock": ("Products in stock", "منتجات في المخزون", "Stoktaki ürünler"),
    "goingOut": ("Going out", "خارج", "Çıkan"),
    "showEmpty": ("Show products with no stock", "إظهار المنتجات بدون مخزون", "Stoğu olmayan ürünleri göster"),
    "outSaved": ("Saved: {n} products, {pcs} pieces went out.", "تم الحفظ: خرج {n} منتج، {pcs} قطعة.", "Kaydedildi: {n} ürün, {pcs} adet çıktı."),
    "noStock": ("No products match.", "لا توجد منتجات مطابقة.", "Eşleşen ürün yok."),
    "reference": ("Reference (optional)", "مرجع (اختياري)", "Referans (isteğe bağlı)"),
    "referenceHint": ("e.g. order number, truck or person", "مثلاً رقم الطلب أو الشاحنة أو الشخص", "örn. sipariş no, kamyon veya kişi"),
    "saveOut": ("Take out {n} products · {pcs} pcs", "إخراج {n} منتج · {pcs} قطعة", "{n} ürün · {pcs} adet çıkar"),
    "adjustQtyHint": ("Positive adds pieces, negative removes them (e.g. −20).", "الموجب يضيف قطعاً والسالب يزيلها (مثلاً −20).", "Pozitif ekler, negatif çıkarır (örn. −20)."),
    "viewEntry": ("View entry", "عرض الإدخال", "Girişi gör"),
    "moreInReport": ("Showing the latest 300. Use the Stock movements report for older ones.", "يُعرض آخر 300. استخدم تقرير حركات المخزون للأقدم.", "Son 300 gösteriliyor. Daha eskiler için Stok hareketleri raporunu kullanın."),
    "allTypes": ("All movement types", "كل أنواع الحركات", "Tüm hareket türleri"),
})
group("order", {
    "filterProducts": ("Filter products by code or name…", "تصفية المنتجات بالرمز أو الاسم…", "Ürünleri koda veya ada göre süz…"),
    "onlyChosen": ("Show only chosen", "إظهار المختار فقط", "Yalnızca seçilenler"),
    "sheetSummary": ("{n} products · {pcs} pcs", "{n} منتج · {pcs} قطعة", "{n} ürün · {pcs} adet"),
    "saveOrder": ("Save order", "حفظ الطلب", "Siparişi kaydet"),
    "needProducts": ("Add products first — orders and daily production are typed against the product list.", "أضف المنتجات أولاً — تُدخل الطلبات والإنتاج اليومي من قائمة المنتجات.", "Önce ürün ekleyin — siparişler ve günlük üretim ürün listesinden girilir."),
    "newHint": ("Type the amount next to each product you need. Leave the rest empty.", "اكتب الكمية بجانب كل منتج تحتاجه. اترك الباقي فارغاً.", "İhtiyacınız olan her ürünün yanına miktarı yazın. Gerisini boş bırakın."),
    "productsPieces": ("{n} products · {pcs} pcs", "{n} منتج · {pcs} قطعة", "{n} ürün · {pcs} adet"),
    "inStock": ("In stock", "في المخزون", "Stokta"),
    "stockNote": ("“In stock” is today's warehouse stock for each product.", "«في المخزون» هو مخزون المستودع اليوم لكل منتج.", "“Stokta”, her ürünün bugünkü depo stoğudur."),
    "completedOn": ("Completed on {date}", "اكتمل في {date}", "{date} tarihinde tamamlandı"),
    "cancelledOn": ("Cancelled on {date}", "أُلغي في {date}", "{date} tarihinde iptal edildi"),
    "count": ("{n} orders", "{n} طلب", "{n} sipariş"),
    "allStatuses": ("All orders", "كل الطلبات", "Tüm siparişler"),
    "searchPlaceholder": ("Order number or product…", "رقم الطلب أو المنتج…", "Sipariş no veya ürün…"),
    "new": ("New order", "طلب جديد", "Yeni sipariş"),
    "deletedMsg": ("Order deleted. The audit log keeps a record of who deleted it and why.", "حُذف الطلب. يحتفظ سجل التدقيق بمن حذفه ولماذا.", "Sipariş silindi. Denetim kaydı kimin neden sildiğini saklar."),
})
group("order.act", {
    "complete": ("Mark completed", "تحديد كمكتمل", "Tamamlandı yap"),
    "completeHelp": ("Use when everything on this order has been delivered.", "استخدمه عند تسليم كل ما في هذا الطلب.", "Bu siparişteki her şey teslim edildiğinde kullanın."),
    "cancel": ("Cancel order", "إلغاء الطلب", "Siparişi iptal et"),
    "cancelHelp": ("The order stays in the list as cancelled and no longer counts as demand.", "يبقى الطلب في القائمة كملغى ولا يُحسب ضمن الطلب.", "Sipariş iptal olarak listede kalır ve artık talep sayılmaz."),
    "reopen": ("Reopen", "إعادة فتح", "Yeniden aç"),
    "reopenHelp": ("Makes the order open again so it can be edited and counts as demand.", "يعيد فتح الطلب ليمكن تعديله ويُحسب ضمن الطلب.", "Sipariş yeniden açılır, düzenlenebilir ve talep sayılır."),
    "delete": ("Delete order", "حذف الطلب", "Siparişi sil"),
    "deleteHelp": ("Only for orders entered by mistake. The order disappears completely; a record of who deleted it and why stays in the audit log.",
                   "فقط للطلبات المُدخلة خطأً. يختفي الطلب تماماً؛ ويبقى في سجل التدقيق من حذفه ولماذا.",
                   "Yalnızca yanlışlıkla girilen siparişler için. Sipariş tamamen silinir; kimin neden sildiği denetim kaydında kalır."),
    "confirmAction": ("Confirm", "تأكيد", "Onayla"),
})
group("daily", {
    "title": ("Daily production entry", "إدخال الإنتاج اليومي", "Günlük üretim girişi"),
    "subtitle": ("{date} · type what was produced for each product and save once.", "{date} · اكتب ما أُنتج لكل منتج واحفظ مرة واحدة.", "{date} · her ürün için üretileni yazın ve bir kez kaydedin."),
    "inOrders": ("In open orders", "في الطلبات المفتوحة", "Açık siparişlerde"),
    "alreadyShift": ("Already entered (shift {shift})", "مُدخل مسبقاً (وردية {shift})", "Girilmiş (vardiya {shift})"),
    "produced": ("Produced", "المُنتج", "Üretilen"),
    "onlyOrdered": ("Only products in open orders", "فقط المنتجات في الطلبات المفتوحة", "Yalnızca açık siparişteki ürünler"),
    "noOrdered": ("No product is in an open order. Untick the box to see all products.", "لا يوجد منتج في طلب مفتوح. أزل التحديد لرؤية كل المنتجات.", "Açık siparişte ürün yok. Tüm ürünler için kutunun işaretini kaldırın."),
    "summary": ("{n} products · {pcs} pcs · shift {shift}", "{n} منتج · {pcs} قطعة · وردية {shift}", "{n} ürün · {pcs} adet · vardiya {shift}"),
    "saved": ("Saved {n} products, {pcs} pieces. Stock was updated.", "حُفظ {n} منتج، {pcs} قطعة. تم تحديث المخزون.", "{n} ürün, {pcs} adet kaydedildi. Stok güncellendi."),
    "saveAll": ("Save all", "حفظ الكل", "Tümünü kaydet"),
    "filter": ("Filter products…", "تصفية المنتجات…", "Ürünleri süz…"),
})
group("prod", {
    "last60": ("last 60 days", "آخر 60 يوماً", "son 60 gün"),
    "prevDay": ("Previous day", "اليوم السابق", "Önceki gün"),
    "nextDay": ("Next day", "اليوم التالي", "Sonraki gün"),
    "day": ("Day", "اليوم", "Gün"),
    "show": ("Show", "عرض", "Göster"),
    "today": ("Today", "اليوم", "Bugün"),
    "allProducts": ("All products", "كل المنتجات", "Tüm ürünler"),
    "total60": ("Produced in the last 60 days", "المُنتج في آخر 60 يوماً", "Son 60 günde üretilen"),
    "totalDay": ("Produced on {date}", "المُنتج في {date}", "{date} tarihinde üretilen"),
    "entriesN": ("{n} entries", "{n} إدخال", "{n} giriş"),
    "nothingDay": ("Nothing entered for this day yet.", "لم يُدخل شيء لهذا اليوم بعد.", "Bu gün için henüz giriş yok."),
    "correct": ("Correct", "تصحيح", "Düzelt"),
    "correctQty": ("Correct quantity", "الكمية الصحيحة", "Doğru miktar"),
    "reason": ("Reason", "السبب", "Neden"),
    "correctReasonHint": ("e.g. typing mistake", "مثلاً خطأ في الكتابة", "örn. yazım hatası"),
    "correctHelp": ("Stock changes by the difference. Enter 0 to delete the entry. Entries already inspected by QC can't be changed.",
                    "يتغير المخزون بالفرق. أدخل 0 لحذف الإدخال. لا يمكن تغيير الإدخالات التي فحصتها الجودة.",
                    "Stok fark kadar değişir. Girişi silmek için 0 girin. KK'nin muayene ettiği girişler değiştirilemez."),
})
group("qc", {
    "searchEntries": ("Product code or name…", "رمز المنتج أو اسمه…", "Ürün kodu veya adı…"),
    "last14": ("All (last 14 days)", "الكل (آخر 14 يوماً)", "Tümü (son 14 gün)"),
    "producedInEntry": ("{n} pcs produced in this entry", "{n} قطعة أُنتجت في هذا الإدخال", "Bu girişte {n} adet üretildi"),
    "alreadyRejected": ("{n} pcs already rejected", "{n} قطعة مرفوضة مسبقاً", "{n} adet zaten reddedildi"),
    "effectReject": ("{n} pcs will be removed from stock and the entry marked Rejected.", "ستُزال {n} قطعة من المخزون ويُعلَّم الإدخال كمرفوض.", "{n} adet stoktan düşülecek ve giriş Reddedildi olarak işaretlenecek."),
    "effectApprove": ("No defects: the entry will be marked Approved.", "لا عيوب: سيُعلَّم الإدخال كمقبول.", "Hata yok: giriş Onaylandı olarak işaretlenecek."),
    "saveReject": ("Reject {n} pcs", "رفض {n} قطعة", "{n} adet reddet"),
    "saveApprove": ("Approve", "قبول", "Onayla"),
    "countsSimple": ("{inspected} inspected · {rejected} rejected", "{inspected} مفحوص · {rejected} مرفوض", "{inspected} muayene · {rejected} red"),
    "whichMachine": ("Which machine?", "أي آلة؟", "Hangi makine?"),
    "policy": ("QC picks daily production entries at random. Products marked “QC required” are listed first. Rejected pieces are removed from stock automatically.",
               "تختار الجودة إدخالات الإنتاج اليومية عشوائياً. تظهر المنتجات «تتطلب فحص جودة» أولاً. تُزال القطع المرفوضة من المخزون تلقائياً.",
               "KK günlük üretim girişlerini rastgele seçer. “KK gerekli” ürünler önce listelenir. Reddedilen adetler stoktan otomatik düşülür."),
    "notInspected": ("Not inspected", "لم يُفحص", "Muayene edilmedi"),
})
group("qc.dec", {"APPROVE": ("Approved", "مقبول", "Onaylandı"), "REJECT": ("Rejected", "مرفوض", "Reddedildi")})
group("dashboard", {
    "openOrders": ("Open orders", "طلبات مفتوحة", "Açık siparişler"),
    "openPieces": ("Pieces in open orders", "قطع في الطلبات المفتوحة", "Açık siparişlerdeki adet"),
    "producedToday": ("Produced today (pcs)", "المُنتج اليوم (قطعة)", "Bugün üretilen (adet)"),
    "productsToday": ("Products made today", "منتجات صُنعت اليوم", "Bugün yapılan ürünler"),
    "producedWeek": ("Produced last 7 days", "المُنتج في آخر 7 أيام", "Son 7 günde üretilen"),
    "notInspected": ("Entries not inspected (14 days)", "إدخالات لم تُفحص (14 يوماً)", "Muayene edilmemiş girişler (14 gün)"),
    "rejectedWeek": ("Rejected last 7 days (pcs)", "المرفوض في آخر 7 أيام (قطعة)", "Son 7 günde reddedilen (adet)"),
    "openIssues": ("Open quality issues", "مشاكل جودة مفتوحة", "Açık kalite sorunları"),
    "stock": ("Pieces in stock", "القطع في المخزون", "Stoktaki adet"),
    "outWeek": ("Out last 7 days (pcs)", "الخارج في آخر 7 أيام (قطعة)", "Son 7 günde çıkan (adet)"),
})
group("rep.sec", {"orders": ("Orders", "الطلبات", "Siparişler"), "warehouse": ("Warehouse", "المستودع", "Depo")})
group("rep.r.production", {"desc": ("Pieces produced and rejected by day, week, month, product or shift.", "القطع المُنتجة والمرفوضة حسب اليوم أو الأسبوع أو الشهر أو المنتج أو الوردية.", "Güne, haftaya, aya, ürüne veya vardiyaya göre üretilen ve reddedilen adetler.")})
group("rep.r.quality", {"desc": ("Inspections, rejected pieces and rejection rates by product.", "الفحوصات والقطع المرفوضة ونسب الرفض حسب المنتج.", "Ürüne göre muayeneler, reddedilen adetler ve red oranları.")})
group("rep.r.production-entries", {"title": ("Daily production entries", "إدخالات الإنتاج اليومية", "Günlük üretim girişleri"), "desc": ("Every entry with day, shift, quantity and QC result.", "كل إدخال مع اليوم والوردية والكمية ونتيجة الجودة.", "Gün, vardiya, miktar ve KK sonucu ile her giriş.")})
group("rep.r.orders", {"title": ("Orders", "الطلبات", "Siparişler"), "desc": ("Orders with their status, products and pieces.", "الطلبات مع حالتها ومنتجاتها وقطعها.", "Durum, ürün ve adetleriyle siparişler.")})
group("rep.r.demand", {"title": ("Ordered vs. stock", "المطلوب مقابل المخزون", "Sipariş vs. stok"), "desc": ("For each product in open orders: pieces ordered, in stock and still to make.", "لكل منتج في الطلبات المفتوحة: القطع المطلوبة والموجودة وما بقي لصنعه.", "Açık siparişteki her ürün için: sipariş edilen, stokta olan ve yapılacak adet.")})
group("rep.r.stock", {"title": ("Stock by product", "المخزون حسب المنتج", "Ürüne göre stok"), "desc": ("Pieces in, out and in stock for each product.", "القطع الداخلة والخارجة والموجودة لكل منتج.", "Her ürün için giren, çıkan ve stoktaki adet.")})
group("rep.r.movements", {"title": ("Stock movements", "حركات المخزون", "Stok hareketleri"), "desc": ("Every stock change: produced, QC rejected, out and adjustments.", "كل تغيير في المخزون: إنتاج، رفض جودة، إخراج وتسويات.", "Her stok değişikliği: üretim, KK reddi, çıkış ve düzeltmeler.")})
group("rep.col", {
    "adjusted": ("Adjusted", "تسوية", "Düzeltme"),
    "day": ("Day", "اليوم", "Gün"),
    "entries": ("Entries", "الإدخالات", "Girişler"),
    "inProduced": ("Produced (in)", "مُنتج (داخل)", "Üretilen (giriş)"),
    "inStock": ("In stock", "في المخزون", "Stokta"),
    "inStockNow": ("In stock now", "في المخزون الآن", "Şu an stokta"),
    "madeInPeriod": ("Made in period", "صُنع في الفترة", "Dönemde yapılan"),
    "openOrders": ("Open orders", "طلبات مفتوحة", "Açık siparişler"),
    "outRejected": ("QC rejected", "رفض الجودة", "KK reddi"),
    "outShipped": ("Went out", "خرج", "Çıkan"),
    "products": ("Products", "المنتجات", "Ürünler"),
    "qc": ("QC", "الجودة", "KK"),
    "reference": ("Reference", "المرجع", "Referans"),
    "stillToMake": ("Still to make", "بقي لصنعه", "Yapılacak"),
})
group("rep.kpi", {
    "entries": ("Entries", "الإدخالات", "Girişler"),
    "notInspected": ("Not inspected", "لم يُفحص", "Muayene edilmedi"),
    "outPcs": ("Pieces out", "القطع الخارجة", "Çıkan adet"),
    "productsOrdered": ("Products ordered", "المنتجات المطلوبة", "Sipariş edilen ürünler"),
    "stockNow": ("Pieces in stock now", "القطع في المخزون الآن", "Şu an stoktaki adet"),
})
group("rep.f", {"defaultStatus": ("All", "الكل", "Tümü")})
group("history.order", {
    "create": ("Order created", "أُنشئ طلب", "Sipariş oluşturuldu"),
    "update": ("Order changed", "عُدّل الطلب", "Sipariş değiştirildi"),
    "complete": ("Order completed", "اكتمل الطلب", "Sipariş tamamlandı"),
    "cancel": ("Order cancelled", "أُلغي الطلب", "Sipariş iptal edildi"),
    "reopen": ("Order reopened", "أُعيد فتح الطلب", "Sipariş yeniden açıldı"),
})
group("history.production", {
    "report": ("Daily production entered", "أُدخل الإنتاج اليومي", "Günlük üretim girildi"),
    "correct": ("Production entry corrected", "صُحح إدخال إنتاج", "Üretim girişi düzeltildi"),
    "delete": ("Production entry deleted", "حُذف إدخال إنتاج", "Üretim girişi silindi"),
})
group("history.stock", {"out": ("Stock taken out", "أُخرج مخزون", "Stoktan çıkış")})
group("history.qc", {"approve": ("QC approved an entry", "قبلت الجودة إدخالاً", "KK bir girişi onayladı"), "reject": ("QC rejected pieces", "رفضت الجودة قطعاً", "KK adet reddetti")})
group("audit.entity", {"ProductionEntry": ("Production entry", "إدخال إنتاج", "Üretim girişi")})
group("sys", {
    "keptList": ("employees and their logins, roles and permissions, departments, defect types and the audit log. Numbering starts again from 0001.",
                 "الموظفون وحساباتهم، الأدوار والصلاحيات، الأقسام، أنواع العيوب وسجل التدقيق. يبدأ الترقيم من 0001 مجدداً.",
                 "çalışanlar ve girişleri, roller ve yetkiler, departmanlar, hata türleri ve denetim kaydı. Numaralandırma 0001'den yeniden başlar."),
    "scopeOpsHint": ("Orders, daily production, maintenance, QC and stock. Products, machines and molds stay.",
                     "الطلبات والإنتاج اليومي والصيانة والجودة والمخزون. تبقى المنتجات والآلات والقوالب.",
                     "Siparişler, günlük üretim, bakım, KK ve stok. Ürünler, makineler ve kalıplar kalır."),
    "scopeAllHint": ("Also deletes {products} products, {machines} machines and {molds} molds.",
                     "يحذف أيضاً {products} منتج و{machines} آلة و{molds} قالب.",
                     "Ayrıca {products} ürün, {machines} makine ve {molds} kalıbı siler."),
})
group("sys.count", {"entries": ("Production entries", "إدخالات الإنتاج", "Üretim girişleri")})

for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"
    d = json.load(open(p, encoding="utf-8"))
    for path in DROP:
        node = d
        parts = path.split(".")
        for part in parts[:-1]:
            node = node.get(part, {})
        node.pop(parts[-1], None)
    for path, vals in S.items():
        node = d
        parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(p, "a").write("\n")
print(len(S), "strings x 3")
