import json
S={}
def add(path,en,ar,tr): S[path]=(en,ar,tr)
def group(prefix, d):
    for k,v in d.items(): add(f"{prefix}.{k}",*v)

group("rep", {
 "intro":("Live figures from the factory's records. Pick a report, set the dates and filters, then export to Excel (CSV) or PDF.","أرقام مباشرة من سجلات المصنع. اختر تقريراً وحدد التواريخ والمرشحات ثم صدّره إلى Excel (CSV) أو PDF.","Fabrika kayıtlarından canlı rakamlar. Bir rapor seçin, tarihleri ve filtreleri ayarlayın, sonra Excel (CSV) veya PDF olarak dışa aktarın."),
 "noExport":("You can view reports. Exporting to CSV or PDF needs the \"Reports: export\" permission.","يمكنك عرض التقارير. التصدير إلى CSV أو PDF يحتاج صلاحية «التقارير: تصدير».","Raporları görüntüleyebilirsiniz. CSV veya PDF dışa aktarmak için \"Raporlar: dışa aktar\" yetkisi gerekir."),
 "csv":("Excel (CSV)","Excel (CSV)","Excel (CSV)"),
 "pdf":("PDF / Print","PDF / طباعة","PDF / Yazdır"),
 "pdfHint":("Choose \"Save as PDF\" as the printer to get a PDF file.","اختر «حفظ كـ PDF» كطابعة للحصول على ملف PDF.","PDF dosyası için yazıcı olarak \"PDF olarak kaydet\"i seçin."),
 "printSave":("Print / Save as PDF","طباعة / حفظ كـ PDF","Yazdır / PDF kaydet"),
 "printedBy":("Printed by {name} · {at}","طُبع بواسطة {name} · {at}","Yazdıran: {name} · {at}"),
 "noData":("No records match these dates and filters.","لا توجد سجلات تطابق هذه التواريخ والمرشحات.","Bu tarih ve filtrelere uyan kayıt yok."),
 "rows":("{n} rows","{n} صف","{n} satır"),
 "rowsLimited":("Showing the first {n} of {total} rows — export to see them all.","عرض أول {n} من {total} صف — صدّر التقرير لرؤيتها كلها.","{total} satırın ilk {n} tanesi gösteriliyor — tümü için dışa aktarın."),
 "chartTop":("Top {n} of {total} shown — all are in the table.","أعلى {n} من {total} — الكل في الجدول.","{total} içinden ilk {n} gösteriliyor — tümü tabloda."),
 "total":("Total","الإجمالي","Toplam"),
 "chartMax":("Highest: {v}","الأعلى: {v}","En yüksek: {v}"),
})
group("rep.unit", {"h":("{n} h","{n} س","{n} sa"),"d":("{n} d","{n} ي","{n} gün"),"hShort":("hours","ساعات","saat"),"dShort":("days","أيام","gün")})
group("rep.sec", {"production":("Production","الإنتاج","Üretim"),"orders":("Orders & delivery","الطلبات والتسليم","Siparişler ve teslimat"),"service":("Machines & maintenance","الآلات والصيانة","Makineler ve bakım"),"quality":("Quality","الجودة","Kalite"),"warehouse":("Warehouse & shipments","المستودع والشحنات","Depo ve sevkiyat")})
R = {
 "production":(("Production output","الإنتاج المنجز","Üretim çıktısı"),("Good and defective pieces by day, week, month, machine, product or shift.","القطع السليمة والمعيبة حسب اليوم أو الأسبوع أو الشهر أو الآلة أو المنتج أو الوردية.","Güne, haftaya, aya, makineye, ürüne veya vardiyaya göre sağlam ve hatalı adet.")),
 "planned-vs-actual":(("Planned vs actual","المخطط مقابل الفعلي","Planlanan ve gerçekleşen"),("Each production job's planned quantity and dates against what was really made.","الكمية والتواريخ المخططة لكل أمر إنتاج مقابل ما أُنتج فعلاً.","Her üretim işinin planlanan miktar ve tarihleri ile gerçekte üretilen.")),
 "order-completion":(("Order completion","إنجاز الطلبات","Sipariş tamamlanma"),("How much of each order has been produced and delivered.","كم أُنتج وسُلّم من كل طلب.","Her siparişin ne kadarının üretildiği ve teslim edildiği.")),
 "on-time":(("On-time delivery","التسليم في الموعد","Zamanında teslimat"),("Orders delivered by the requested date, late, or still overdue.","الطلبات المسلّمة في الموعد أو المتأخرة أو التي ما زالت متأخرة.","İstenen tarihte, geç teslim edilen veya hâlâ geciken siparişler.")),
 "delayed":(("Delayed orders","الطلبات المتأخرة","Geciken siparişler"),("Open orders past their requested delivery date, most overdue first.","الطلبات المفتوحة التي تجاوزت موعد التسليم، الأكثر تأخراً أولاً.","İstenen teslim tarihini geçmiş açık siparişler, en çok geciken önce.")),
 "outstanding":(("Outstanding quantities","الكميات المتبقية","Kalan miktarlar"),("For every open order line: ordered, produced, received, shipped and what is left.","لكل بند طلب مفتوح: المطلوب والمنتج والمستلم والمشحون والمتبقي.","Her açık sipariş satırı için: sipariş, üretilen, kabul, sevk ve kalan.")),
 "downtime":(("Machine downtime","توقف الآلات","Makine duruşları"),("Hours lost by machine or reason, or every stop in detail.","الساعات الضائعة حسب الآلة أو السبب، أو كل توقف بالتفصيل.","Makineye veya nedene göre kaybedilen saatler ya da her duruş ayrıntılı.")),
 "maintenance":(("Maintenance requests","طلبات الصيانة","Bakım talepleri"),("Requests raised, their status and how long repairs took.","الطلبات المقدمة وحالتها ومدة الإصلاح.","Açılan talepler, durumları ve onarım süreleri.")),
 "mold-changes":(("Mold changes","تغييرات القوالب","Kalıp değişimleri"),("Every mold removed or installed, with time taken and technician.","كل قالب أُزيل أو رُكّب مع الوقت المستغرق والفني.","Sökülen veya takılan her kalıp, süre ve teknisyen ile.")),
 "quality":(("Rejection rates","نسب الرفض","Ret oranları"),("Inspections, held and rejected pieces and defect rates by product.","الفحوصات والقطع المحجوزة والمرفوضة ونسب العيوب حسب المنتج.","Ürüne göre muayeneler, bekletilen ve reddedilen adetler ve hata oranları.")),
 "defects":(("Quality defects","عيوب الجودة","Kalite hataları"),("Quality issues by defect type and severity.","مشاكل الجودة حسب نوع العيب والخطورة.","Hata türüne ve önem derecesine göre kalite sorunları.")),
 "corrective":(("Corrective actions","الإجراءات التصحيحية","Düzeltici faaliyetler"),("Every corrective action recorded against a quality issue.","كل إجراء تصحيحي مسجل على مشكلة جودة.","Kalite sorunlarına kaydedilen her düzeltici faaliyet.")),
 "receipts":(("Warehouse receipts","استلامات المستودع","Depo kabulleri"),("Finished goods received from production.","البضائع الجاهزة المستلمة من الإنتاج.","Üretimden kabul edilen mamuller.")),
 "movements":(("Inventory movements","حركات المخزون","Stok hareketleri"),("Every stock movement: receipts, reservations, shipments, QC changes and adjustments.","كل حركة مخزون: استلام وحجز وشحن وتغييرات الجودة والتعديلات.","Tüm stok hareketleri: kabul, ayırma, sevk, KK değişiklikleri ve düzeltmeler.")),
 "shipments":(("Customer shipments","شحنات العملاء","Müşteri sevkiyatları"),("Dispatched shipments with delivery notes, pieces and vehicles.","الشحنات المرسلة مع إشعارات التسليم والقطع والمركبات.","İrsaliye, adet ve araç bilgisiyle yapılan sevkiyatlar.")),
}
for k,(title,desc) in R.items():
    add(f"rep.r.{k}.title",*title); add(f"rep.r.{k}.desc",*desc)
group("rep.group", {"day":("Day","اليوم","Gün"),"week":("Week starting","بداية الأسبوع","Hafta başlangıcı"),"month":("Month","الشهر","Ay"),"machine":("Machine","الآلة","Makine"),"product":("Product","المنتج","Ürün"),"shift":("Shift","الوردية","Vardiya"),"category":("Reason","السبب","Neden"),"list":("Every stop","كل توقف","Her duruş")})
group("rep.shift", {"A":("Shift A (07–15)","الوردية A (07–15)","A vardiyası (07–15)"),"B":("Shift B (15–23)","الوردية B (15–23)","B vardiyası (15–23)"),"C":("Shift C (23–07)","الوردية C (23–07)","C vardiyası (23–07)")})
group("rep.outcome", {"ON_TIME":("On time","في الموعد","Zamanında"),"LATE":("Delivered late","سُلّم متأخراً","Geç teslim"),"OVERDUE":("Overdue","متأخر","Gecikmiş"),"NOT_DUE":("Not due yet","لم يحن موعده","Henüz vadesi gelmedi")})
group("rep.f", {
 "from":("From","من","Başlangıç"),"to":("To","إلى","Bitiş"),"reset":("Clear filters","مسح المرشحات","Filtreleri temizle"),"groupBy":("Group by","تجميع حسب","Gruplama"),
 "allCustomers":("All customers","كل العملاء","Tüm müşteriler"),"allProducts":("All products","كل المنتجات","Tüm ürünler"),"allMachines":("All machines","كل الآلات","Tüm makineler"),
 "allPriorities":("All priorities","كل الأولويات","Tüm öncelikler"),"allCategories":("All reasons","كل الأسباب","Tüm nedenler"),"allSeverities":("All severities","كل الدرجات","Tüm dereceler"),
 "allTypes":("All movement types","كل أنواع الحركات","Tüm hareket türleri"),"defaultStatus":("All (except cancelled)","الكل (عدا الملغى)","Tümü (iptal hariç)"),
 "period":("Period: {from} – {to}","الفترة: {from} – {to}","Dönem: {from} – {to}"),
})
group("rep.f.preset", {"today":("Today","اليوم","Bugün"),"last7":("Last 7 days","آخر 7 أيام","Son 7 gün"),"last30":("Last 30 days","آخر 30 يوماً","Son 30 gün"),"thisMonth":("This month","هذا الشهر","Bu ay"),"lastMonth":("Last month","الشهر الماضي","Geçen ay"),"thisYear":("This year","هذه السنة","Bu yıl")})
group("rep.col", {
 "accepted":("Accepted","مقبول","Kabul"),"achieved":("Achieved","المنجز","Gerçekleşme"),"actionTaken":("Action taken","الإجراء المتخذ","Yapılan faaliyet"),
 "actualEnd":("Actual end","النهاية الفعلية","Gerçek bitiş"),"assigned":("Assigned to","مُسند إلى","Atanan"),"available":("Available","متاح","Kullanılabilir"),
 "batch":("Batch","الدفعة","Parti"),"batches":("Batches","الدفعات","Partiler"),"by":("By","بواسطة","Yapan"),"category":("Reason","السبب","Neden"),
 "completed":("Completed","اكتمل","Tamamlandı"),"confirmedBy":("Dispatched by","أرسلها","Sevk eden"),"created":("Raised","أُنشئ","Açıldı"),
 "critical":("Critical","حرج","Kritik"),"customer":("Customer","العميل","Müşteri"),"daysLate":("Days late","أيام التأخير","Gecikme (gün)"),
 "daysOverdue":("Days overdue","أيام التأخر","Gecikme (gün)"),"defectRate":("Defect rate","نسبة العيوب","Hata oranı"),"defectType":("Defect type","نوع العيب","Hata türü"),
 "defective":("Defective","معيب","Hatalı"),"delPct":("Delivered","المسلّم","Teslim"),"deliveredOn":("Delivered on","تاريخ التسليم","Teslim tarihi"),
 "deliveryNote":("Delivery note","إشعار التسليم","İrsaliye"),"driver":("Driver","السائق","Şoför"),"due":("Requested date","التاريخ المطلوب","İstenen tarih"),
 "ended":("Ended","انتهى","Bitti"),"events":("Stops","التوقفات","Duruşlar"),"good":("Good pieces","قطع سليمة","Sağlam adet"),"held":("Held","محجوز","Bekletilen"),
 "holdDecisions":("Hold / reject decisions","قرارات حجز/رفض","Bekletme / ret kararı"),"hours":("Hours","الساعات","Saat"),"hoursToFix":("Hours to fix","ساعات الإصلاح","Onarım süresi"),
 "inspected":("Inspected","المفحوص","Muayene edilen"),"inspections":("Inspections","الفحوصات","Muayeneler"),"issue":("Issue","المشكلة","Sorun"),
 "issueStatus":("Issue status","حالة المشكلة","Sorun durumu"),"issues":("Issues","المشاكل","Sorunlar"),"job":("Job","أمر الإنتاج","İş"),"jobs":("Jobs","أوامر الإنتاج","İşler"),
 "lastShipment":("Last shipment","آخر شحنة","Son sevkiyat"),"late":("Late","متأخر","Gecikti"),"line":("Line","البند","Satır"),"location":("Location","الموقع","Yer"),
 "longest":("Longest stop","أطول توقف","En uzun duruş"),"machine":("Machine","الآلة","Makine"),"machineDown":("Machine down","الآلة متوقفة","Makine durdu"),
 "major":("Major","كبير","Büyük"),"minor":("Minor","بسيط","Küçük"),"minutes":("Minutes","الدقائق","Dakika"),"mold":("Mold","القالب","Kalıp"),
 "moldInstalled":("Mold installed","القالب المركب","Takılan kalıp"),"moldRemoved":("Mold removed","القالب المُزال","Sökülen kalıp"),"movement":("Movement","الحركة","Hareket"),
 "order":("Order","الطلب","Sipariş"),"ordered":("Ordered","المطلوب","Sipariş edilen"),"outcome":("Result","النتيجة","Sonuç"),"pieces":("Pieces","القطع","Adet"),
 "planned":("Planned","المخطط","Planlanan"),"plannedEnd":("Planned end","النهاية المخططة","Planlanan bitiş"),"preventive":("Preventive","وقائية","Önleyici"),
 "priority":("Priority","الأولوية","Öncelik"),"prodPct":("Produced","المُنتَج","Üretilen"),"produced":("Produced","المُنتَج","Üretilen"),"product":("Product","المنتج","Ürün"),
 "qty":("Quantity","الكمية","Miktar"),"quarantine":("Quarantine","حجر","Karantina"),"reason":("Reason","السبب","Neden"),"receipt":("Receipt","الاستلام","Kabul"),
 "received":("Received","المستلم","Kabul edilen"),"rejected":("Rejected","المرفوض","Reddedilen"),"rejectionRate":("Rejection rate","نسبة الرفض","Ret oranı"),
 "request":("Request","الطلب","Talep"),"resolved":("Resolved","محلولة","Çözüldü"),"serviceReport":("Service report","تقرير الخدمة","Servis raporu"),
 "severity":("Severity","الخطورة","Önem"),"share":("Share","الحصة","Pay"),"shift":("Shift","الوردية","Vardiya"),"shipment":("Shipment","الشحنة","Sevkiyat"),
 "shipped":("Shipped","المشحون","Sevk edilen"),"started":("Started","بدأ","Başladı"),"status":("Status","الحالة","Durum"),"stockState":("Stock state","حالة المخزون","Stok durumu"),
 "technician":("Technician","الفني","Teknisyen"),"title":("Problem","المشكلة","Sorun"),"toDeliver":("Left to deliver","المتبقي للتسليم","Teslim edilecek"),
 "toProduce":("Left to produce","المتبقي للإنتاج","Üretilecek"),"totalMade":("Total made","إجمالي الإنتاج","Toplam üretim"),"unresolved":("Unresolved","غير محلولة","Çözülmedi"),
 "variance":("Difference","الفرق","Fark"),"vehicle":("Vehicle","المركبة","Araç"),"when":("Date & time","التاريخ والوقت","Tarih ve saat"),
})
group("rep.kpi", {
 "achievement":("Plan achieved","تحقيق الخطة","Plan gerçekleşme"),"actions":("Corrective actions","الإجراءات التصحيحية","Düzeltici faaliyet"),"adjustments":("Adjustments","التعديلات","Düzeltmeler"),
 "avgChangeMinutes":("Avg. minutes per change","متوسط الدقائق لكل تغيير","Değişim başına ort. dakika"),"avgDaysLate":("Avg. days late","متوسط أيام التأخير","Ort. gecikme (gün)"),
 "avgDaysOverdue":("Avg. days overdue","متوسط أيام التأخر","Ort. gecikme (gün)"),"avgHoursToFix":("Avg. hours to fix","متوسط ساعات الإصلاح","Ort. onarım süresi"),
 "avgPerDay":("Good pieces per day","قطع سليمة يومياً","Günlük sağlam adet"),"breakdownHours":("Breakdown hours","ساعات الأعطال","Arıza saatleri"),
 "changeHours":("Hours spent changing","ساعات التغيير","Değişim saatleri"),"completionRate":("Completion rate","نسبة الإنجاز","Tamamlanma oranı"),"critical":("Critical","حرجة","Kritik"),
 "customersServed":("Customers","العملاء","Müşteriler"),"defectRate":("Defect rate","نسبة العيوب","Hata oranı"),"defectivePcs":("Defective pieces","قطع معيبة","Hatalı adet"),
 "delayedOrders":("Delayed orders","طلبات متأخرة","Geciken sipariş"),"deliveredShare":("Pieces delivered","القطع المسلّمة","Teslim edilen adet"),
 "downHours":("Downtime hours","ساعات التوقف","Duruş saatleri"),"events":("Stops","التوقفات","Duruşlar"),"fullyDelivered":("Fully delivered","مسلّمة بالكامل","Tamamen teslim"),
 "goodPcs":("Good pieces","قطع سليمة","Sağlam adet"),"inspectedPcs":("Pieces inspected","القطع المفحوصة","Muayene edilen adet"),"inspections":("Inspections","الفحوصات","Muayeneler"),
 "issues":("Quality issues","مشاكل الجودة","Kalite sorunları"),"issuesCovered":("Issues worked on","المشاكل المعالجة","Üzerinde çalışılan sorun"),"issuesResolved":("Issues resolved","المشاكل المحلولة","Çözülen sorun"),
 "jobs":("Jobs","أوامر الإنتاج","İşler"),"judged":("Orders due","الطلبات المستحقة","Vadesi gelen sipariş"),"lateJobs":("Jobs late","أوامر متأخرة","Geciken iş"),
 "lateOrOverdue":("Late or overdue","متأخرة","Geç veya gecikmiş"),"machineDownRequests":("Machine-down requests","طلبات توقف آلة","Makine durdu talebi"),
 "moldChanges":("Mold changes","تغييرات القوالب","Kalıp değişimi"),"movements":("Movements","الحركات","Hareketler"),"onTime":("On time","في الموعد","Zamanında"),
 "onTimeRate":("On-time rate","نسبة الالتزام بالموعد","Zamanında oranı"),"ongoing":("Still stopped","ما زالت متوقفة","Hâlâ duruşta"),"openLines":("Open order lines","بنود مفتوحة","Açık sipariş satırı"),
 "orderedPcs":("Pieces ordered","القطع المطلوبة","Sipariş adedi"),"orders":("Orders","الطلبات","Siparişler"),"ordersCompleted":("Orders completed","طلبات مكتملة","Tamamlanan sipariş"),
 "pcsToDeliver":("Pieces to deliver","قطع للتسليم","Teslim edilecek adet"),"pcsToProduce":("Pieces to produce","قطع للإنتاج","Üretilecek adet"),"plannedPcs":("Pieces planned","القطع المخططة","Planlanan adet"),
 "producedPcs":("Pieces produced","القطع المنتجة","Üretilen adet"),"producedShare":("Pieces produced","القطع المنتجة","Üretilen adet"),"quarantinePcs":("Into quarantine","إلى الحجر","Karantinaya"),
 "receipts":("Receipts","الاستلامات","Kabuller"),"receivedPcs":("Pieces received","القطع المستلمة","Kabul edilen adet"),"rejectedPcs":("Pieces rejected","القطع المرفوضة","Reddedilen adet"),
 "rejectionRate":("Rejection rate","نسبة الرفض","Ret oranı"),"requests":("Requests","الطلبات","Talepler"),"resolvedRate":("Resolved","المحلول","Çözülen"),
 "shipments":("Shipments","الشحنات","Sevkiyatlar"),"shippedPcs":("Pieces shipped","القطع المشحونة","Sevk edilen adet"),"stillOpen":("Still open","ما زالت مفتوحة","Hâlâ açık"),
 "unresolved":("Unresolved","غير محلولة","Çözülmedi"),"urgentDelayed":("Urgent among them","العاجلة منها","Acil olanlar"),
})
group("history", {"report.export":("Report exported","تم تصدير تقرير","Rapor dışa aktarıldı")})

group("search", {
 "title":("Search","البحث","Ara"),
 "hint":("Find any order, customer, product code, batch, machine, mold, quality issue, maintenance request or shipment.","ابحث عن أي طلب أو عميل أو رمز منتج أو دفعة أو آلة أو قالب أو مشكلة جودة أو طلب صيانة أو شحنة.","Herhangi bir sipariş, müşteri, ürün kodu, parti, makine, kalıp, kalite sorunu, bakım talebi veya sevkiyatı bulun."),
 "typeMore":("Type at least 2 characters. Typing an exact number (like ORD-2026-0001) opens that record directly.","اكتب حرفين على الأقل. كتابة رقم كامل (مثل ORD-2026-0001) تفتح السجل مباشرة.","En az 2 karakter yazın. Tam bir numara (ör. ORD-2026-0001) yazmak kaydı doğrudan açar."),
 "none":("Nothing found for \"{q}\".","لا توجد نتائج لـ «{q}».","\"{q}\" için sonuç bulunamadı."),
})
group("search.kind", {
 "orders":("Customer orders","طلبات العملاء","Müşteri siparişleri"),"customers":("Customers","العملاء","Müşteriler"),"products":("Products","المنتجات","Ürünler"),
 "batches":("Batches / lots","الدفعات","Partiler"),"jobs":("Production jobs","أوامر الإنتاج","Üretim işleri"),"machines":("Machines","الآلات","Makineler"),
 "molds":("Molds","القوالب","Kalıplar"),"issues":("Quality issues","مشاكل الجودة","Kalite sorunları"),"inspections":("QC inspections","فحوصات الجودة","KK muayeneleri"),
 "requests":("Maintenance requests","طلبات الصيانة","Bakım talepleri"),"serviceReports":("Service reports","تقارير الخدمة","Servis raporları"),
 "shipments":("Shipments","الشحنات","Sevkiyatlar"),"receipts":("Warehouse receipts","استلامات المستودع","Depo kabulleri"),
})
group("ui", {
 "errorTitle":("This page couldn't load","تعذر تحميل هذه الصفحة","Bu sayfa yüklenemedi"),
 "errorBody":("Nothing was lost. Check your connection and try again. If it keeps happening, tell the administrator the reference below.","لم يُفقد شيء. تحقق من الاتصال وحاول مجدداً. إذا تكرر ذلك أخبر المسؤول بالرقم المرجعي أدناه.","Hiçbir şey kaybolmadı. Bağlantınızı kontrol edip tekrar deneyin. Sürerse yöneticiye aşağıdaki referansı iletin."),
 "tryAgain":("Try again","حاول مجدداً","Tekrar dene"),
 "notFoundTitle":("Page not found","الصفحة غير موجودة","Sayfa bulunamadı"),
 "notFoundBody":("The record may have been moved, or the link is wrong. Try searching for it.","ربما نُقل السجل أو أن الرابط خاطئ. جرّب البحث عنه.","Kayıt taşınmış veya bağlantı hatalı olabilir. Aramayı deneyin."),
})
group("audit", {
 "intro":("Who did what and when. Entries can't be edited or deleted.","من فعل ماذا ومتى. لا يمكن تعديل السجلات أو حذفها.","Kim, ne zaman, ne yaptı. Kayıtlar düzenlenemez veya silinemez."),
 "search":("Action, reason or record ID…","الإجراء أو السبب أو معرّف السجل…","İşlem, neden veya kayıt kimliği…"),
 "anyTime":("Any time","أي وقت","Tüm zamanlar"),"lastDays":("Last {n} days","آخر {n} أيام","Son {n} gün"),"anyone":("Anyone","أي شخص","Herkes"),"anyRecord":("Any record","أي سجل","Tüm kayıtlar"),
 "system":("System","النظام","Sistem"),"open":("Open record","فتح السجل","Kaydı aç"),"reason":("Reason","السبب","Neden"),"changes":("Changes","التغييرات","Değişiklikler"),
 "count":("{n} entries","{n} سجل","{n} kayıt"),
})
group("audit.entity", {
 "Order":("Order","طلب","Sipariş"),"ProductionJob":("Production job","أمر إنتاج","Üretim işi"),"Batch":("Batch","دفعة","Parti"),"QcInspection":("QC inspection","فحص جودة","KK muayenesi"),
 "QualityIssue":("Quality issue","مشكلة جودة","Kalite sorunu"),"MaintenanceRequest":("Maintenance request","طلب صيانة","Bakım talebi"),"ServiceReport":("Service report","تقرير خدمة","Servis raporu"),
 "PreventiveTask":("Preventive task","مهمة وقائية","Önleyici görev"),"Shipment":("Shipment","شحنة","Sevkiyat"),"WarehouseReceipt":("Warehouse receipt","استلام مستودع","Depo kabulü"),
 "StockMovement":("Stock","مخزون","Stok"),"StorageLocation":("Storage location","موقع تخزين","Depo yeri"),"Customer":("Customer","عميل","Müşteri"),"Product":("Product","منتج","Ürün"),
 "Machine":("Machine","آلة","Makine"),"Mold":("Mold","قالب","Kalıp"),"DefectCategory":("Defect type","نوع عيب","Hata türü"),"User":("Employee","موظف","Çalışan"),
 "Role":("Role","دور","Rol"),"Report":("Report","تقرير","Rapor"),"AuditLog":("Audit log","سجل التدقيق","Denetim kaydı"),"Attachment":("Attachment","مرفق","Ek"),
})
add("nav.audit","Audit log","سجل التدقيق","Denetim kaydı")
add("history.audit.export","Audit log exported","تم تصدير سجل التدقيق","Denetim kaydı dışa aktarıldı")

for i,loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[i]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3")
