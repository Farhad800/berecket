import json
S={}
def add(path,en,ar,tr): S[path]=(en,ar,tr)
svc = {
 "newRequest":("New maintenance request","طلب صيانة جديد","Yeni bakım talebi"),
 "newReport":("Daily service report","تقرير خدمة يومي","Günlük servis raporu"),
 "searchRequests":("Request no. or problem…","رقم الطلب أو المشكلة…","Talep no veya sorun…"),
 "searchReports":("Report no. or work done…","رقم التقرير أو العمل المنجز…","Rapor no veya yapılan iş…"),
 "openStatuses":("Open & completed","المفتوحة والمكتملة","Açık ve tamamlanan"),
 "machineDown":("Machine down","الماكينة متوقفة","Makine duruyor"),
 "preventive":("Preventive","وقائية","Önleyici"),
 "assignedTo":("Assigned to","مُسند إلى","Atanan"),
 "assignTo":("Assign to…","إسناد إلى…","Ata…"),
 "assigned":("Assigned.","تم الإسناد.","Atandı."),
 "moldChange":("Mold change","تغيير القالب","Kalıp değişimi"),
 "newPreventive":("New preventive task","مهمة وقائية جديدة","Yeni önleyici görev"),
 "pmTitle":("Task","المهمة","Görev"),
 "pmTitleHint":("e.g. Change hydraulic oil filter, Clean mold vents","مثال: تغيير فلتر الزيت الهيدروليكي، تنظيف فتحات القالب","Örn. Hidrolik yağ filtresi değişimi, Kalıp hava kanalı temizliği"),
 "everyDays":("Every (days)","كل (أيام)","Her (gün)"),
 "everyN":("every {n} days","كل {n} يوماً","her {n} günde"),
 "nextDue":("Next due","الموعد القادم","Sonraki tarih"),
 "lastDone":("Last done","آخر تنفيذ","Son yapılan"),
 "markDone":("Mark done","تم التنفيذ","Yapıldı"),
 "makeRequest":("Create request","إنشاء طلب","Talep oluştur"),
 "pause":("Pause","إيقاف","Durdur"),
 "enable":("Enable","تفعيل","Etkinleştir"),
 "noPreventive":("No preventive tasks yet.","لا توجد مهام وقائية بعد.","Henüz önleyici görev yok."),
 "newRequestHint":("Technical Service is notified straight away.","يتم إشعار الخدمة الفنية فوراً.","Teknik servis hemen bilgilendirilir."),
 "sendRequest":("Send request","إرسال الطلب","Talebi gönder"),
 "problem":("Problem","المشكلة","Sorun"),
 "problemHint":("Short and clear, e.g. 'Oil leak at clamp cylinder'","قصير وواضح، مثل: 'تسرب زيت في أسطوانة الإغلاق'","Kısa ve net, örn. 'Kapama silindirinde yağ kaçağı'"),
 "details":("Details","التفاصيل","Ayrıntılar"),
 "relatedJob":("Related production job","عمل الإنتاج المرتبط","İlgili üretim işi"),
 "machineDownHint":("The machine is shown as down in the schedule until the repair is completed.","تظهر الماكينة متوقفة في الجدول حتى اكتمال الإصلاح.","Onarım tamamlanana kadar makine planda arızalı görünür."),
 "reportedBy":("Reported by","أبلغ عنه","Bildiren"),
 "readyAt":("Ready to run again","جاهزة للتشغيل","Tekrar çalışmaya hazır"),
 "verified":("Verified","تم التحقق","Doğrulandı"),
 "resolution":("Repair done","الإصلاح المنجز","Yapılan onarım"),
 "resolutionPlaceholder":("What was repaired or replaced?","ما الذي تم إصلاحه أو استبداله؟","Ne onarıldı veya değiştirildi?"),
 "reasonPlaceholder":("Reason (required)","السبب (مطلوب)","Neden (zorunlu)"),
 "newReportHint":("Record mold changes, repairs and maintenance done on your shift.","سجل تغييرات القوالب والإصلاحات والصيانة في ورديتك.","Vardiyanızdaki kalıp değişimlerini, onarımları ve bakımları kaydedin."),
 "saveReport":("Save report","حفظ التقرير","Raporu kaydet"),
 "date":("Date","التاريخ","Tarih"),
 "moldOnMachine":("Mold on machine","القالب على الماكينة","Makinedeki kalıp"),
 "relatedRequest":("Maintenance request","طلب الصيانة","Bakım talebi"),
 "relatedOrder":("Related order","الطلب المرتبط","İlgili sipariş"),
 "workPerformed":("Work performed","العمل المنجز","Yapılan iş"),
 "moldRemoved":("Mold removed","القالب المُزال","Sökülen kalıp"),
 "moldInstalled":("Mold installed","القالب المُركّب","Takılan kalıp"),
 "moldChangeReason":("Reason for mold change","سبب تغيير القالب","Kalıp değişim nedeni"),
 "moldChangeReasonHint":("Required when a mold is removed or installed","مطلوب عند إزالة أو تركيب قالب","Kalıp sökülür veya takılırsa zorunlu"),
 "breakdown":("Machine breakdown","عطل الماكينة","Makine arızası"),
 "startTime":("Start time","وقت البدء","Başlangıç saati"),
 "endTime":("End time","وقت الانتهاء","Bitiş saati"),
 "downtimeMinutes":("Machine stopped (minutes)","توقف الماكينة (دقائق)","Makine duruşu (dakika)"),
 "downtimeHint":("Leave empty to use start → end","اتركه فارغاً لحسابه من البدء إلى الانتهاء","Boş bırakılırsa başlangıç → bitiş kullanılır"),
 "spareParts":("Spare parts used","قطع الغيار المستخدمة","Kullanılan yedek parçalar"),
 "repairsCompleted":("Repairs completed","الإصلاحات المكتملة","Tamamlanan onarımlar"),
 "outstanding":("Outstanding work","الأعمال المتبقية","Kalan işler"),
 "followUp":("Follow-up needed","المتابعة المطلوبة","Gerekli takip"),
 "technician":("Technician","الفني","Teknisyen"),
 "reportSubtitle":("Daily service report","تقرير خدمة يومي","Günlük servis raporu"),
 "hasOutstanding":("Has outstanding work","توجد أعمال متبقية","Kalan iş var"),
}
for k,v in svc.items(): add(f"svc.{k}",*v)
for k,v in {"requests":("Maintenance requests","طلبات الصيانة","Bakım talepleri"),"reports":("Service reports","تقارير الخدمة","Servis raporları"),"preventive":("Preventive maintenance","الصيانة الوقائية","Önleyici bakım")}.items(): add(f"svc.tab.{k}",*v)
for k,v in {"ok":("On schedule","في الموعد","Zamanında"),"soon":("Due this week","مستحق هذا الأسبوع","Bu hafta"),"overdue":("Overdue","متأخر","Gecikmiş"),"off":("Paused","متوقف","Durduruldu")}.items(): add(f"svc.pm.{k}",*v)
for k,v in {
 "start":("Start work","بدء العمل","İşe başla"),"waitParts":("Waiting for parts","بانتظار قطع الغيار","Parça bekleniyor"),
 "complete":("Repair completed","اكتمل الإصلاح","Onarım tamamlandı"),"verify":("Verify","تحقق","Doğrula"),
 "reopen":("Reopen","إعادة فتح","Yeniden aç"),"cancel":("Cancel request","إلغاء الطلب","Talebi iptal et"),"confirm":("Confirm","تأكيد","Onayla"),
}.items(): add(f"svc.act.{k}",*v)
for k,v in {
 "start":("Work started.","بدأ العمل.","İşe başlandı."),"waitParts":("Marked as waiting for parts.","بانتظار قطع الغيار.","Parça bekleniyor olarak işaretlendi."),
 "complete":("Repair completed — Production has been notified.","اكتمل الإصلاح — تم إشعار الإنتاج.","Onarım tamamlandı — Üretim bilgilendirildi."),
 "verify":("Verified.","تم التحقق.","Doğrulandı."),"reopen":("Reopened.","أُعيد فتحه.","Yeniden açıldı."),"cancel":("Cancelled.","أُلغي.","İptal edildi."),
}.items(): add(f"svc.done.{k}",*v)
for k,v in {
 "OPEN":("Open","مفتوح","Açık"),"IN_PROGRESS":("In progress","قيد التنفيذ","Devam ediyor"),"WAITING_PARTS":("Waiting for parts","بانتظار قطع الغيار","Parça bekliyor"),
 "COMPLETED":("Completed","مكتمل","Tamamlandı"),"VERIFIED":("Verified","تم التحقق","Doğrulandı"),"CANCELLED":("Cancelled","ملغى","İptal edildi"),
}.items(): add(f"status.maint.{k}",*v)
hist = {
 "lastDays":("Last {n} days","آخر {n} يوماً","Son {n} gün"),
 "days":("{n} days","{n} يوماً","{n} gün"),
 "downtimeH":("Downtime (h)","التوقف (ساعة)","Duruş (sa)"),
 "breakdowns":("Breakdowns","الأعطال","Arızalar"),
 "moldChanges":("Mold changes","تغييرات القالب","Kalıp değişimleri"),
 "openRequests":("Open requests","الطلبات المفتوحة","Açık talepler"),
 "requests":("Maintenance requests","طلبات الصيانة","Bakım talepleri"),
 "repeated":("Repeated failures","أعطال متكررة","Tekrarlayan arıza"),
 "repeatedWarning":("Repeated failures: {n} breakdowns in the last {days} days. Consider a root-cause check or overhaul.","أعطال متكررة: {n} أعطال خلال آخر {days} يوماً. يُنصح بفحص السبب الجذري أو صيانة شاملة.","Tekrarlayan arıza: son {days} günde {n} arıza. Kök neden analizi veya revizyon düşünün."),
 "timeline":("Timeline","التسلسل الزمني","Zaman çizelgesi"),
 "downtimeByReason":("Downtime by reason","التوقف حسب السبب","Nedene göre duruş"),
}
for k,v in hist.items(): add(f"hist.{k}",*v)
for k,v in {"title":("Photos & documents","الصور والمستندات","Fotoğraflar ve belgeler"),"none":("No files yet.","لا توجد ملفات بعد.","Henüz dosya yok."),
 "add":("Add photo or PDF","إضافة صورة أو PDF","Fotoğraf veya PDF ekle"),"uploading":("Uploading…","جارٍ الرفع…","Yükleniyor…")}.items(): add(f"files.{k}",*v)
for k,v in {"unread":("{n} unread","{n} غير مقروءة","{n} okunmamış"),"none":("No notifications.","لا توجد إشعارات.","Bildirim yok."),"markAll":("Mark all read","تعليم الكل كمقروء","Tümünü okundu say")}.items(): add(f"notif.{k}",*v)
for k,v in {
 "maintenance.create":("Maintenance request created","أُنشئ طلب صيانة","Bakım talebi oluşturuldu"),
 "maintenance.start":("Work started","بدأ العمل","İşe başlandı"),
 "maintenance.waitParts":("Waiting for parts","بانتظار قطع الغيار","Parça bekleniyor"),
 "maintenance.complete":("Repair completed","اكتمل الإصلاح","Onarım tamamlandı"),
 "maintenance.verify":("Repair verified","تم التحقق من الإصلاح","Onarım doğrulandı"),
 "maintenance.reopen":("Reopened","أُعيد فتحه","Yeniden açıldı"),
 "maintenance.cancel":("Cancelled","أُلغي","İptal edildi"),
 "maintenance.assign":("Assigned","أُسند","Atandı"),
 "file.upload":("File added","أُضيف ملف","Dosya eklendi"),
}.items(): add(f"history.{k}",*v)
for i,loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[i]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3")
