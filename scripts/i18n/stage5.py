import json
S={}
def add(path,en,ar,tr): S[path]=(en,ar,tr)
qc = {
 "policy":("Batches are released by default; QC samples randomly and can hold or reject any batch at any time.","تُفرج الدفعات افتراضياً؛ تفحص الجودة عينات عشوائية ويمكنها حجز أو رفض أي دفعة في أي وقت.","Partiler varsayılan olarak serbesttir; KK rastgele numune alır ve herhangi bir partiyi her an bekletebilir veya reddedebilir."),
 "criticalBanner":("{n} critical quality issues are open","{n} مشاكل جودة حرجة مفتوحة","{n} kritik kalite sorunu açık"),
 "searchBatches":("Batch, product code or order…","الدفعة، رمز المنتج أو الطلب…","Parti, ürün kodu veya sipariş…"),
 "searchIssues":("Issue no., description or batch…","رقم المشكلة، الوصف أو الدفعة…","Sorun no, açıklama veya parti…"),
 "needsAttention":("Needs attention + last 7 days","تحتاج متابعة + آخر 7 أيام","Dikkat gerekenler + son 7 gün"),
 "randomPick":("Random sample suggestion:","اقتراح عينة عشوائية:","Rastgele numune önerisi:"),
 "notInspected":("not inspected","غير مفحوص","kontrol edilmedi"),
 "inspection":("Inspection","الفحص","Kontrol"),
 "decision":("Decision","القرار","Karar"),
 "inspected":("Inspected","المفحوص","Kontrol edilen"),
 "accepted":("Accepted","المقبول","Kabul"),
 "rejectedShort":("Rejected","المرفوض","Ret"),
 "hold":("On hold","محجوز","Bekletilen"),
 "inspector":("Inspector","المفتش","Kontrolör"),
 "sample":("sample","عينة","numune"),
 "full":("full inspection","فحص كامل","tam kontrol"),
 "unresolved":("Unresolved","غير المحلولة","Çözülmemiş"),
 "severity":("Severity","الخطورة","Önem"),
 "actionsCount":("{n} actions","{n} إجراءات","{n} faaliyet"),
 "categoriesHelp":("Defect types used in inspections. Disable a type instead of deleting it, so past records stay intact.","أنواع العيوب المستخدمة في الفحص. عطّل النوع بدلاً من حذفه للحفاظ على السجلات السابقة.","Kontrollerde kullanılan hata türleri. Geçmiş kayıtlar korunsun diye silmek yerine devre dışı bırakın."),
 "newCategory":("New defect type","نوع عيب جديد","Yeni hata türü"),
 "categoryName":("Defect type","نوع العيب","Hata türü"),
 "recordInspection":("Record inspection","تسجيل الفحص","Kontrol kaydet"),
 "producedInBatch":("{n} good pieces produced in this batch","{n} قطعة سليمة منتجة في هذه الدفعة","Bu partide {n} sağlam adet üretildi"),
 "saved":("Inspection saved.","تم حفظ الفحص.","Kontrol kaydedildi."),
 "holdOnlyHint":("You can put a batch on hold. Releasing or rejecting needs QC approval rights.","يمكنك حجز الدفعة. الإفراج أو الرفض يتطلب صلاحية اعتماد الجودة.","Partiyi bekletebilirsiniz. Serbest bırakma veya ret için KK onay yetkisi gerekir."),
 "sampleOnly":("Sample inspection (not every piece)","فحص عينة (ليس كل القطع)","Numune kontrolü (her parça değil)"),
 "addMinorDefect":("+ Record a defect anyway","+ تسجيل عيب على أي حال","+ Yine de hata kaydet"),
 "defect":("Defect","العيب","Hata"),
 "defectType":("Defect type","نوع العيب","Hata türü"),
 "responsible":("Responsible department","القسم المسؤول","Sorumlu bölüm"),
 "defectDescription":("What is wrong","ما المشكلة","Sorun nedir"),
 "recommendedAction":("Recommended corrective action","الإجراء التصحيحي المقترح","Önerilen düzeltici faaliyet"),
 "saveDecision":("Save — {decision}","حفظ — {decision}","Kaydet — {decision}"),
 "inWarehouse":("In warehouse: {available} available · {quarantine} quarantine · {rejected} rejected","في المستودع: {available} متاح · {quarantine} حجر · {rejected} مرفوض","Depoda: {available} kullanılabilir · {quarantine} karantina · {rejected} ret"),
 "noInspections":("Not inspected yet.","لم يُفحص بعد.","Henüz kontrol edilmedi."),
 "counts":("{inspected} inspected · {accepted} accepted · {rejected} rejected · {hold} held","{inspected} مفحوص · {accepted} مقبول · {rejected} مرفوض · {hold} محجوز","{inspected} kontrol · {accepted} kabul · {rejected} ret · {hold} bekletme"),
 "batchStatus":("Batch status","حالة الدفعة","Parti durumu"),
 "correctiveActions":("Corrective actions","الإجراءات التصحيحية","Düzeltici faaliyetler"),
 "noActions":("No corrective action recorded yet.","لم يُسجل إجراء تصحيحي بعد.","Henüz düzeltici faaliyet yok."),
 "addAction":("Record corrective action","تسجيل إجراء تصحيحي","Düzeltici faaliyet kaydet"),
 "actionPlaceholder":("What was done to fix the cause?","ما الذي تم لمعالجة السبب؟","Nedeni gidermek için ne yapıldı?"),
 "saveAction":("Save action","حفظ الإجراء","Faaliyeti kaydet"),
 "actionSaved":("Corrective action recorded.","سُجل الإجراء التصحيحي.","Düzeltici faaliyet kaydedildi."),
 "submit":("Submit for QC verification","إرسال لتحقق الجودة","KK doğrulamasına gönder"),
 "resolve":("Verify & resolve","تحقق وإغلاق","Doğrula ve kapat"),
 "toMaintenance":("Create maintenance request","إنشاء طلب صيانة","Bakım talebi oluştur"),
 "reopenReason":("Reason to reopen","سبب إعادة الفتح","Yeniden açma nedeni"),
 "reopen":("Reopen","إعادة فتح","Yeniden aç"),
}
for k,v in qc.items(): add(f"qc.{k}",*v)
for k,v in {"inspect":("To inspect","للفحص","Kontrol edilecek"),"inspections":("Inspections","الفحوصات","Kontroller"),"issues":("Quality issues","مشاكل الجودة","Kalite sorunları"),"categories":("Defect types","أنواع العيوب","Hata türleri")}.items(): add(f"qc.tab.{k}",*v)
for k,v in {"APPROVE":("Approve","اعتماد","Onayla"),"PARTIAL":("Partial release","إفراج جزئي","Kısmi serbest"),"HOLD":("Hold","حجز","Beklet"),"REJECT":("Reject","رفض","Reddet")}.items(): add(f"qc.dec.{k}",*v)
for k,v in {
 "APPROVE":("The whole batch becomes approved stock.","تصبح الدفعة كاملة مخزوناً معتمداً.","Partinin tamamı onaylı stok olur."),
 "PARTIAL":("Sorting result: the rejected and held pieces are blocked, the rest is released.","نتيجة الفرز: تُحجب القطع المرفوضة والمحجوزة ويُفرج عن الباقي.","Ayıklama sonucu: ret ve bekletilen parçalar bloke, kalanı serbest."),
 "HOLD":("The whole batch is blocked (quarantine) until QC decides. It can't be shipped.","تُحجب الدفعة كاملة (حجر) حتى قرار الجودة ولا يمكن شحنها.","KK karar verene kadar partinin tamamı bloke (karantina), sevk edilemez."),
 "REJECT":("The whole batch is rejected and can never be shipped.","تُرفض الدفعة كاملة ولا يمكن شحنها أبداً.","Partinin tamamı reddedilir ve asla sevk edilemez."),
}.items(): add(f"qc.effect.{k}",*v)
for k,v in {"PRODUCTION":("Production","الإنتاج","Üretim"),"SERVICE":("Technical service","الخدمة الفنية","Teknik servis"),"QC":("Quality control","مراقبة الجودة","Kalite kontrol"),"WAREHOUSE":("Warehouse","المستودع","Depo")}.items(): add(f"qc.dept.{k}",*v)
for k,v in {"submit":("Submitted for verification.","أُرسل للتحقق.","Doğrulamaya gönderildi."),"resolve":("Issue resolved.","أُغلقت المشكلة.","Sorun kapatıldı."),"reopen":("Issue reopened.","أُعيد فتح المشكلة.","Sorun yeniden açıldı.")}.items(): add(f"qc.issueDone.{k}",*v)
for k,v in {"MINOR":("Minor","بسيطة","Küçük"),"MAJOR":("Major","كبيرة","Büyük"),"CRITICAL":("Critical","حرجة","Kritik")}.items(): add(f"status.severity.{k}",*v)
for k,v in {"OPEN":("Open","مفتوحة","Açık"),"IN_PROGRESS":("In progress","قيد المعالجة","Devam ediyor"),"AWAITING_VERIFICATION":("Awaiting verification","بانتظار التحقق","Doğrulama bekliyor"),"RESOLVED":("Resolved","محلولة","Çözüldü"),"REOPENED":("Reopened","أُعيد فتحها","Yeniden açıldı")}.items(): add(f"status.issue.{k}",*v)
for k,v in {
 "qc.approve":("QC approved the batch","اعتمدت الجودة الدفعة","KK partiyi onayladı"),
 "qc.partial":("QC partial release","إفراج جزئي من الجودة","KK kısmi serbest bıraktı"),
 "qc.hold":("QC put the batch on hold","حجزت الجودة الدفعة","KK partiyi bekletti"),
 "qc.reject":("QC rejected the batch","رفضت الجودة الدفعة","KK partiyi reddetti"),
 "qc.issue_create":("Quality issue opened","فُتحت مشكلة جودة","Kalite sorunu açıldı"),
 "qc.corrective_action":("Corrective action recorded","سُجل إجراء تصحيحي","Düzeltici faaliyet kaydedildi"),
 "qc.issue_submit":("Submitted for verification","أُرسل للتحقق","Doğrulamaya gönderildi"),
 "qc.issue_resolve":("Verified and resolved","تم التحقق والإغلاق","Doğrulandı ve kapatıldı"),
 "qc.issue_reopen":("Reopened","أُعيد فتحه","Yeniden açıldı"),
}.items(): add(f"history.{k}",*v)
for i,loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[i]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3")
