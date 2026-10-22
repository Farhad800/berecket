# Stage 2 strings for en / ar / tr, merged into messages/*.json
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)

for k,(en,ar,tr) in {
 "restore":("Restore","استعادة","Geri yükle"),"archive":("Archive","أرشفة","Arşivle"),"archived":("Archived","مؤرشف","Arşivlenmiş"),
}.items(): add(f"common.{k}",en,ar,tr)

md = {
 "customerName":("Customer name","اسم العميل","Müşteri adı"),"code":("Code","الرمز","Kod"),
 "codeAuto":("Leave empty to number automatically","اتركه فارغاً للترقيم التلقائي","Otomatik numara için boş bırakın"),
 "contactName":("Contact person","جهة الاتصال","İlgili kişi"),"phone":("Phone","الهاتف","Telefon"),"email":("Email","البريد الإلكتروني","E-posta"),
 "address":("Address","العنوان","Adres"),"notes":("Notes","ملاحظات","Notlar"),"newCustomer":("New customer","عميل جديد","Yeni müşteri"),
 "openOrders":("{n} open orders","{n} طلبات مفتوحة","{n} açık sipariş"),
 "productCode":("Product code","رمز المنتج","Ürün kodu"),"productName":("Product name","اسم المنتج","Ürün adı"),
 "material":("Material","المادة","Malzeme"),"color":("Color","اللون","Renk"),"weightGrams":("Weight (g)","الوزن (غ)","Ağırlık (g)"),
 "cycleTime":("Cycle time (s)","زمن الدورة (ث)","Çevrim süresi (sn)"),
 "cycleTimeHint":("Used to check if a planned job fits its time slot","يُستخدم للتحقق من أن مدة العمل المخطط كافية","Planlanan işin süreye sığıp sığmadığını kontrol eder"),
 "unit":("Unit","الوحدة","Birim"),"pcs":("pcs","قطعة","adet"),
 "qcRequired":("Inspection required before release","فحص الجودة مطلوب قبل الإفراج","Sevkten önce kalite kontrol zorunlu"),
 "qcRequiredHint":("Otherwise batches are released and QC checks randomly","وإلا تُفرج الدفعات ويفحص قسم الجودة عشوائياً","Aksi halde partiler serbest bırakılır, KK rastgele kontrol eder"),
 "qcRequiredShort":("QC required","فحص مطلوب","KK zorunlu"),"specifications":("Specifications","المواصفات","Teknik özellikler"),
 "newProduct":("New product","منتج جديد","Yeni ürün"),"molds":("Molds","القوالب","Kalıplar"),"machines":("Machines","الماكينات","Makineler"),
 "machineCode":("Machine number","رقم الماكينة","Makine no"),"machineName":("Machine name","اسم الماكينة","Makine adı"),
 "manufacturer":("Manufacturer","الشركة المصنعة","Üretici"),"model":("Model","الموديل","Model"),"tonnage":("Clamping force (t)","قوة الإغلاق (طن)","Kapama kuvveti (ton)"),
 "newMachine":("New machine","ماكينة جديدة","Yeni makine"),"openMaintenance":("{n} open maintenance","{n} صيانة مفتوحة","{n} açık bakım"),
 "moldsMounted":("Molds here","القوالب المركبة","Takılı kalıplar"),"moldCode":("Mold number","رقم القالب","Kalıp no"),"moldName":("Mold name","اسم القالب","Kalıp adı"),
 "cavities":("Cavities","عدد التجاويف","Göz sayısı"),"product":("Product","المنتج","Ürün"),"currentMachine":("Mounted on machine","مركب على الماكينة","Takılı olduğu makine"),
 "newMold":("New mold","قالب جديد","Yeni kalıp"),"shots":("Shot count","عدد الحقن","Baskı sayısı"),
}
for k,v in md.items(): add(f"md.{k}",*v)

for k,v in {
 "AVAILABLE":("Available","متاحة","Müsait"),"RUNNING":("Running","تعمل","Çalışıyor"),"DOWN":("Broken down","معطلة","Arızalı"),
 "MAINTENANCE":("In maintenance","في الصيانة","Bakımda"),"RETIRED":("Retired","خارج الخدمة","Hizmet dışı"),
}.items(): add(f"status.machine.{k}",*v)
for k,v in {
 "AVAILABLE":("Available","متاح","Müsait"),"IN_USE":("In use","قيد الاستخدام","Kullanımda"),"IN_REPAIR":("In repair","قيد الإصلاح","Tamirde"),"RETIRED":("Retired","خارج الخدمة","Hizmet dışı"),
}.items(): add(f"status.mold.{k}",*v)
for k,v in {
 "DRAFT":("Draft","مسودة","Taslak"),"CONFIRMED":("Confirmed","مؤكد","Onaylandı"),"WAITING_PLANNING":("Waiting for planning","بانتظار التخطيط","Planlama bekliyor"),
 "SCHEDULED":("Scheduled","مجدول","Planlandı"),"IN_PRODUCTION":("In production","قيد الإنتاج","Üretimde"),"ON_HOLD":("On hold","معلق","Beklemede"),
 "PARTIALLY_PRODUCED":("Partially produced","منتج جزئياً","Kısmen üretildi"),"AWAITING_QC":("Awaiting quality inspection","بانتظار فحص الجودة","Kalite kontrol bekliyor"),
 "PARTIALLY_COMPLETED":("Partially completed","مكتمل جزئياً","Kısmen tamamlandı"),"COMPLETED":("Completed","مكتمل","Tamamlandı"),
 "READY_FOR_DISPATCH":("Ready for dispatch","جاهز للشحن","Sevke hazır"),"PARTIALLY_DELIVERED":("Partially delivered","مسلّم جزئياً","Kısmen teslim edildi"),
 "DELIVERED":("Delivered","مسلّم","Teslim edildi"),"CANCELLED":("Cancelled","ملغى","İptal edildi"),
}.items(): add(f"status.order.{k}",*v)
for k,v in {"LOW":("Low","منخفضة","Düşük"),"NORMAL":("Normal","عادية","Normal"),"HIGH":("High","عالية","Yüksek"),"URGENT":("Urgent","عاجلة","Acil")}.items():
    add(f"status.priority.{k}",*v)
for k,v in {"PLANNED":("Planned","مخطط","Planlandı"),"IN_PROGRESS":("Running","قيد التشغيل","Çalışıyor"),"PAUSED":("Paused","متوقف مؤقتاً","Duraklatıldı"),
 "COMPLETED":("Completed","مكتمل","Tamamlandı"),"CANCELLED":("Cancelled","ملغى","İptal edildi")}.items():
    add(f"status.job.{k}",*v)

order = {
 "customerSection":("Customer & delivery","العميل والتسليم","Müşteri ve teslimat"),"customer":("Customer","العميل","Müşteri"),
 "customerReference":("Customer PO / reference","رقم أمر شراء العميل","Müşteri sipariş no"),"customerReferenceHint":("Optional","اختياري","İsteğe bağlı"),
 "requestedDelivery":("Requested delivery","موعد التسليم المطلوب","İstenen teslim tarihi"),"priority":("Priority","الأولوية","Öncelik"),
 "plannedStart":("Planned start","بدء الإنتاج المخطط","Planlanan başlangıç"),"plannedEnd":("Planned finish","انتهاء الإنتاج المخطط","Planlanan bitiş"),
 "products":("Products","المنتجات","Ürünler"),"line":("Line","البند","Kalem"),"removeLine":("Remove line","حذف البند","Kalemi sil"),
 "product":("Product","المنتج","Ürün"),"quantity":("Quantity","الكمية","Miktar"),"lineSpecs":("Specifications for this order","مواصفات هذا الطلب","Bu siparişe özel özellikler"),
 "addLine":("Add product","إضافة منتج","Ürün ekle"),"instructionsSection":("Instructions","التعليمات","Talimatlar"),
 "instructions":("Production instructions","تعليمات الإنتاج","Üretim talimatları"),"packaging":("Packaging / labeling","التغليف / الملصقات","Ambalaj / etiket"),
 "changeReason":("Reason for change","سبب التعديل","Değişiklik nedeni"),
 "changeReasonHint":("Required when dates change on a confirmed order","مطلوب عند تغيير تواريخ طلب مؤكد","Onaylı siparişte tarih değişirse zorunlu"),
 "saveDraft":("Save as draft","حفظ كمسودة","Taslak kaydet"),"saveConfirm":("Save & confirm","حفظ وتأكيد","Kaydet ve onayla"),
 "count":("{n} orders","{n} طلب","{n} sipariş"),"new":("New order","طلب جديد","Yeni sipariş"),
 "searchPlaceholder":("Order no., customer, product code…","رقم الطلب، العميل، رمز المنتج…","Sipariş no, müşteri, ürün kodu…"),
 "allStatuses":("All statuses","كل الحالات","Tüm durumlar"),"openOnly":("Open orders","الطلبات المفتوحة","Açık siparişler"),
 "due":("Due","الاستحقاق","Teslim"),"dueWeek":("Due in 7 days","خلال 7 أيام","7 gün içinde"),"overdueShort":("late","متأخر","gecikti"),
 "progressLine":("{done} of {total} made · {shipped} shipped","{done} من {total} مُنتج · {shipped} مشحون","{total} adetin {done} adedi üretildi · {shipped} sevk"),
 "needMasterData":("Add at least one customer and one product first.","أضف عميلاً ومنتجاً واحداً على الأقل أولاً.","Önce en az bir müşteri ve bir ürün ekleyin."),
 "newHint":("One order can contain several products.","يمكن أن يحتوي الطلب الواحد على عدة منتجات.","Bir sipariş birden fazla ürün içerebilir."),
 "planProduction":("Plan production","تخطيط الإنتاج","Üretimi planla"),"created":("Created","تاريخ الإنشاء","Oluşturuldu"),"confirmed":("Confirmed","تاريخ التأكيد","Onaylandı"),
 "exception":("Closed with exception","أُغلق باستثناء","İstisna ile kapatıldı"),
 "ofPieces":("{done} of {total} pcs","{done} من {total} قطعة","{total} adetin {done} adedi"),
 "history":("History","السجل","Geçmiş"),"reasonPlaceholder":("Reason (required)","السبب (مطلوب)","Neden (zorunlu)"),
}
for k,v in order.items(): add(f"order.{k}",*v)
for k,v in {
 "planned":("Planned","مخطط","Planlanan"),"produced":("Produced","مُنتج","Üretilen"),"defective":("Defective","معيب","Hatalı"),
 "pendingQc":("Awaiting QC","بانتظار الفحص","KK bekliyor"),"blocked":("Held/rejected","محجوز/مرفوض","Bekletilen/red"),
 "released":("Accepted","مقبول","Kabul edilen"),"received":("In warehouse","في المستودع","Depoda"),"shipped":("Shipped","مشحون","Sevk edilen"),
 "toProduce":("Left to make","متبقٍ للإنتاج","Üretilecek"),"toDeliver":("Left to deliver","متبقٍ للتسليم","Teslim edilecek"),
}.items(): add(f"order.q.{k}",*v)
for k,v in {
 "confirm":("Confirm order","تأكيد الطلب","Siparişi onayla"),"hold":("Put on hold","تعليق","Beklemeye al"),"resume":("Resume","استئناف","Devam ettir"),
 "cancel":("Cancel order","إلغاء الطلب","Siparişi iptal et"),"close":("Close with exception","إغلاق باستثناء","İstisna ile kapat"),
 "holdHelp":("Production planning stops until the order is resumed.","يتوقف تخطيط الإنتاج حتى يُستأنف الطلب.","Sipariş devam ettirilene kadar planlama durur."),
 "cancelHelp":("Planned jobs that haven't started are cancelled too.","تُلغى أيضاً أعمال الإنتاج المخططة التي لم تبدأ.","Başlamamış planlı işler de iptal edilir."),
 "closeHelp":("Marks the order delivered even though not every piece was shipped. Use only with management approval.","يُعتبر الطلب مسلّماً رغم عدم شحن كل القطع. استخدمه بموافقة الإدارة فقط.","Tüm adetler sevk edilmese de sipariş teslim sayılır. Yalnızca yönetim onayıyla kullanın."),
 "confirmAction":("Confirm","تأكيد","Onayla"),
}.items(): add(f"order.act.{k}",*v)
for k,v in {"title":("Comments","التعليقات","Yorumlar"),"none":("No comments yet.","لا توجد تعليقات بعد.","Henüz yorum yok."),
 "placeholder":("Write a comment…","اكتب تعليقاً…","Yorum yazın…"),"add":("Post","نشر","Gönder")}.items(): add(f"comments.{k}",*v)
for k,v in {
 "order.create":("Order created as draft","أُنشئ الطلب كمسودة","Sipariş taslak olarak oluşturuldu"),
 "order.create_confirm":("Order created and confirmed","أُنشئ الطلب وأُكّد","Sipariş oluşturuldu ve onaylandı"),
 "order.update":("Order edited","عُدّل الطلب","Sipariş düzenlendi"),"order.deadline_change":("Delivery date changed","تغيّر موعد التسليم","Teslim tarihi değişti"),
 "order.confirm":("Order confirmed","أُكّد الطلب","Sipariş onaylandı"),"order.hold":("Put on hold","عُلّق الطلب","Beklemeye alındı"),
 "order.resume":("Resumed","استؤنف الطلب","Devam ettirildi"),"order.cancel":("Cancelled","أُلغي الطلب","İptal edildi"),
 "order.close":("Closed with exception","أُغلق باستثناء","İstisna ile kapatıldı"),
 "job.create":("Production job scheduled","جُدول عمل إنتاج","Üretim işi planlandı"),"job.update":("Production job updated","حُدّث عمل الإنتاج","Üretim işi güncellendi"),
 "job.reschedule":("Production job rescheduled","أُعيدت جدولة عمل الإنتاج","Üretim işi yeniden planlandı"),"job.cancel":("Production job cancelled","أُلغي عمل الإنتاج","Üretim işi iptal edildi"),
}.items(): add(f"history.{k}",*v)

sched = {
 "newJob":("Schedule job","جدولة عمل","İş planla"),"job":("Job","العمل","İş"),"actual":("Actual","الفعلي","Gerçekleşen"),
 "orderLine":("Order / product","الطلب / المنتج","Sipariş / ürün"),"remainingToPlan":("{n} pcs still to plan","{n} قطعة متبقية للتخطيط","{n} adet planlanacak"),
 "machine":("Machine","الماكينة","Makine"),"mold":("Mold","القالب","Kalıp"),"start":("Start","البداية","Başlangıç"),"finish":("Finish","النهاية","Bitiş"),
 "plannedQty":("Planned quantity","الكمية المخططة","Planlanan miktar"),"sameAsOrder":("Same as order","مثل الطلب","Siparişle aynı"),
 "conflictsTitle":("Check before saving","تحقق قبل الحفظ","Kaydetmeden önce kontrol edin"),
 "acknowledge":("I understand the warnings — schedule anyway","أفهم التحذيرات — جدولة على أي حال","Uyarıları anladım — yine de planla"),
 "override":("Override the clash (needs a reason)","تجاوز التعارض (يتطلب سبباً)","Çakışmayı geçersiz kıl (neden gerekli)"),
 "rescheduleReason":("Reason for rescheduling","سبب إعادة الجدولة","Yeniden planlama nedeni"),
 "rescheduleReasonHint":("Required if time, machine or mold changes","مطلوب عند تغيير الوقت أو الماكينة أو القالب","Zaman, makine veya kalıp değişirse zorunlu"),
 "overrideReason":("Reason for override","سبب التجاوز","Geçersiz kılma nedeni"),"saveAnyway":("Save with these issues","حفظ مع هذه الملاحظات","Bu sorunlarla kaydet"),
 "schedule":("Schedule","جدولة","Planla"),"cancelJob":("Cancel job","إلغاء العمل","İşi iptal et"),"shift":("Shift","الوردية","Vardiya"),
 "today":("Today","اليوم","Bugün"),"machineDown":("Machine down","ماكينة متوقفة","Makine arızalı"),
 "noMachines":("Add your injection machines first.","أضف ماكينات الحقن أولاً.","Önce enjeksiyon makinelerini ekleyin."),
 "needsPlanning":("Needs planning","بحاجة إلى تخطيط","Planlama bekleyenler"),"showAll":("show all","عرض الكل","tümü"),
 "allPlanned":("All open orders are fully planned.","كل الطلبات المفتوحة مخططة بالكامل.","Tüm açık siparişler planlandı."),
 "toPlan":("{n} pcs to plan","{n} قطعة للتخطيط","{n} adet planlanacak"),"plan":("Plan","خطط","Planla"),
 "deadlinesInRange":("Deliveries due in this period","التسليمات المستحقة في هذه الفترة","Bu dönemde teslim edilecekler"),
}
for k,v in sched.items(): add(f"sched.{k}",*v)
for k,v in {"day":("Day","يوم","Gün"),"week":("Week","أسبوع","Hafta"),"month":("Month","شهر","Ay")}.items(): add(f"sched.view.{k}",*v)
for k,v in {
 "MACHINE_OVERLAP":("{machine} is already booked for {job} at this time.","الماكينة {machine} محجوزة للعمل {job} في هذا الوقت.","{machine} bu saatte {job} için ayrılmış."),
 "MOLD_OVERLAP":("Mold {mold} is planned on {machine} for {job} at this time.","القالب {mold} مخطط على {machine} للعمل {job} في هذا الوقت.","{mold} kalıbı bu saatte {machine} üzerinde {job} için planlı."),
 "MACHINE_UNAVAILABLE":("{machine} is currently marked {status}.","الماكينة {machine} حالتها حالياً {status}.","{machine} şu anda {status} durumunda."),
 "MAINTENANCE_OPEN":("{machine} has open maintenance request {request} (machine down).","للماكينة {machine} طلب صيانة مفتوح {request} (متوقفة).","{machine} için açık bakım talebi var: {request} (makine duruyor)."),
 "MOLD_UNAVAILABLE":("Mold {mold} is marked {status}.","القالب {mold} حالته {status}.","{mold} kalıbı {status} durumunda."),
 "MOLD_PRODUCT_MISMATCH":("Mold {mold} is registered for a different product than {product}.","القالب {mold} مسجل لمنتج غير {product}.","{mold} kalıbı {product} dışında bir ürün için kayıtlı."),
 "DEADLINE":("Finishes after the requested delivery date of {order}.","ينتهي بعد موعد التسليم المطلوب للطلب {order}.","{order} için istenen teslim tarihinden sonra bitiyor."),
 "CAPACITY":("Needs about {needed} h at this cycle time, but the slot is {available} h.","يحتاج نحو {needed} ساعة بزمن الدورة هذا، والفترة {available} ساعة فقط.","Bu çevrim süresiyle yaklaşık {needed} saat gerekli, ayrılan süre {available} saat."),
 "OVER_PLANNED":("Planned total {planned} pcs is more than the {ordered} ordered.","إجمالي المخطط {planned} قطعة أكثر من المطلوب {ordered}.","Planlanan toplam {planned} adet, sipariş edilen {ordered} adetten fazla."),
}.items(): add(f"sched.conflict.{k}",*v)

for idx, loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[idx]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3 languages")
