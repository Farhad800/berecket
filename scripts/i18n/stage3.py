import json
S={}
def add(path,en,ar,tr): S[path]=(en,ar,tr)
prod = {
 "reported":("Quantity added.","تمت إضافة الكمية.","Miktar eklendi."),
 "pausedMsg":("Job paused.","تم إيقاف العمل مؤقتاً.","İş duraklatıldı."),
 "startedMsg":("Job started — first batch opened.","بدأ العمل — فُتحت أول دفعة.","İş başladı — ilk parti açıldı."),
 "resumedMsg":("Job resumed.","استؤنف العمل.","İş devam ediyor."),
 "newBatchMsg":("New batch opened.","فُتحت دفعة جديدة.","Yeni parti açıldı."),
 "completedMsg":("Job completed.","اكتمل العمل.","İş tamamlandı."),
 "start":("Start job","بدء العمل","İşi başlat"),
 "reportTitle":("Report production","تسجيل الإنتاج","Üretim bildir"),
 "batch":("Batch","الدفعة","Parti"),
 "good":("Good pieces","قطع سليمة","Sağlam adet"),
 "defective":("Defective","معيب","Hatalı"),
 "addQuantity":("Add quantity","إضافة الكمية","Miktarı ekle"),
 "pause":("Pause","إيقاف مؤقت","Duraklat"),
 "resume":("Resume","استئناف","Devam"),
 "newBatch":("New batch","دفعة جديدة","Yeni parti"),
 "logDowntime":("Log stop","تسجيل توقف","Duruş kaydet"),
 "logDowntimeHint":("For a stop that already ended, without pausing the job.","لتوقف انتهى بالفعل، دون إيقاف العمل.","Bitmiş bir duruş için; işi duraklatmadan."),
 "complete":("Complete job","إنهاء العمل","İşi bitir"),
 "pauseTitle":("Why is the machine stopping?","لماذا توقفت الماكينة؟","Makine neden duruyor?"),
 "category":("Reason type","نوع السبب","Neden türü"),
 "whatHappened":("What happened","ماذا حدث","Ne oldu"),
 "createMaintenance":("Send a maintenance request to Technical Service","إرسال طلب صيانة إلى الخدمة الفنية","Teknik servise bakım talebi gönder"),
 "machineDown":("Machine can't run until repaired","لا يمكن تشغيل الماكينة حتى الإصلاح","Makine tamir edilene kadar çalışamaz"),
 "breakdownHint":("A breakdown always creates a maintenance request.","العطل يُنشئ دائماً طلب صيانة.","Arıza her zaman bakım talebi oluşturur."),
 "pauseConfirm":("Pause job","إيقاف العمل","İşi duraklat"),
 "completeTitle":("Finish this job?","إنهاء هذا العمل؟","Bu iş bitirilsin mi?"),
 "completeHint":("Closes the open batch and frees the machine. Remaining quantity stays on the order for a new job.","يغلق الدفعة المفتوحة ويحرر الماكينة. تبقى الكمية المتبقية في الطلب لعمل جديد.","Açık partiyi kapatır ve makineyi serbest bırakır. Kalan miktar yeni iş için siparişte kalır."),
 "completeNote":("Note (optional)","ملاحظة (اختياري)","Not (isteğe bağlı)"),
 "correctLink":("Correct a reported quantity…","تصحيح كمية مسجلة…","Bildirilen miktarı düzelt…"),
 "correctHint":("Old entries are never changed. A correction adds a + or − line with your reason, so the history stays complete.","لا تُعدّل السجلات القديمة أبداً. يضيف التصحيح سطراً بـ + أو − مع السبب ليبقى السجل كاملاً.","Eski kayıtlar değiştirilmez. Düzeltme, nedeninizle birlikte + veya − satırı ekler."),
 "reason":("Reason","السبب","Neden"),
 "goodDelta":("Good pieces + / −","القطع السليمة + / −","Sağlam + / −"),
 "defectiveDelta":("Defective + / −","المعيب + / −","Hatalı + / −"),
 "deltaHint":("Use a minus sign to remove, e.g. -200","استخدم إشارة السالب للإزالة، مثل -200","Çıkarmak için eksi kullanın, örn. -200"),
 "saveCorrection":("Save correction","حفظ التصحيح","Düzeltmeyi kaydet"),
 "ofPlanned":("{done} of {total} pcs","{done} من {total} قطعة","{total} adetin {done} adedi"),
 "downtime":("Downtime","وقت التوقف","Duruş süresi"),
 "minutes":("{n} min","{n} دقيقة","{n} dk"),
 "plannedWindow":("Planned","المخطط","Planlanan"),
 "actualWindow":("Actual","الفعلي","Gerçekleşen"),
 "batches":("Batches / lots","الدفعات","Partiler / lotlar"),
 "noBatches":("A batch opens when the job starts.","تُفتح دفعة عند بدء العمل.","İş başladığında bir parti açılır."),
 "qc":("Quality","الجودة","Kalite"),
 "open":("open","مفتوحة","açık"),
 "log":("Production log","سجل الإنتاج","Üretim kaydı"),
 "correction":("correction","تصحيح","düzeltme"),
 "ongoing":("ongoing","مستمر","devam ediyor"),
 "shiftNow":("Current shift: {shift}","الوردية الحالية: {shift}","Şu anki vardiya: {shift}"),
 "todayByMachine":("Today by machine (good / defective)","اليوم حسب الماكينة (سليم / معيب)","Bugün makineye göre (sağlam / hatalı)"),
 "searchPlaceholder":("Job, order, product code or batch…","العمل، الطلب، رمز المنتج أو الدفعة…","İş, sipariş, ürün kodu veya parti…"),
}
for k,v in prod.items(): add(f"prod.{k}",*v)
for k,v in {"now":("Now & today","الآن واليوم","Şimdi ve bugün"),"planned":("Planned","المخطط","Planlanan"),"done":("Completed","المكتمل","Tamamlanan")}.items(): add(f"prod.tab.{k}",*v)
for k,v in {
 "BREAKDOWN":("Machine breakdown","عطل الماكينة","Makine arızası"),"MOLD_CHANGE":("Mold change","تغيير القالب","Kalıp değişimi"),
 "MOLD_PROBLEM":("Mold problem","مشكلة في القالب","Kalıp sorunu"),"MATERIAL":("No material / material problem","نقص أو مشكلة في المادة الخام","Hammadde yok / sorunlu"),
 "POWER":("Power cut","انقطاع الكهرباء","Elektrik kesintisi"),"QUALITY":("Quality problem","مشكلة جودة","Kalite sorunu"),
 "NO_OPERATOR":("No operator","لا يوجد مشغّل","Operatör yok"),"SETUP":("Setup / adjustment","إعداد / ضبط","Ayar / hazırlık"),"OTHER":("Other","أخرى","Diğer"),
}.items(): add(f"prod.cat.{k}",*v)
for k,v in {
 "PENDING":("Awaiting QC","بانتظار الفحص","KK bekliyor"),"RELEASED":("Released","مُفرج عنه","Serbest"),"APPROVED":("Approved","معتمد","Onaylı"),
 "PARTIAL":("Partly held","محجوز جزئياً","Kısmen bekletildi"),"HOLD":("On hold","محجوز","Bekletiliyor"),"REJECTED":("Rejected","مرفوض","Reddedildi"),
}.items(): add(f"status.qc.{k}",*v)
add("sched.openJob","Open job","فتح العمل","İşi aç")
for k,v in {
 "job.start":("Job started","بدأ العمل","İş başladı"),"job.pause":("Job paused","أُوقف العمل مؤقتاً","İş duraklatıldı"),
 "job.resume":("Job resumed","استؤنف العمل","İş devam etti"),"job.complete":("Job completed","اكتمل العمل","İş tamamlandı"),
 "production.report":("Quantity reported","سُجلت كمية","Miktar bildirildi"),"production.correct":("Quantity corrected","صُحّحت كمية","Miktar düzeltildi"),
 "batch.open":("New batch opened","فُتحت دفعة جديدة","Yeni parti açıldı"),"downtime.log":("Stop recorded","سُجل توقف","Duruş kaydedildi"),
}.items(): add(f"history.{k}",*v)
for i,loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[i]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3")
