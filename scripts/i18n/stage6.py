import json
S={}
def add(path,en,ar,tr): S[path]=(en,ar,tr)
wh = {
 "ledgerNote":("Stock is calculated from recorded movements — totals can't be typed in.","يُحسب المخزون من الحركات المسجلة — لا يمكن إدخال الإجماليات يدوياً.","Stok kayıtlı hareketlerden hesaplanır — toplamlar elle girilemez."),
 "searchStock":("Batch, product or order…","الدفعة، المنتج أو الطلب…","Parti, ürün veya sipariş…"),
 "noStock":("No stock on hand.","لا يوجد مخزون.","Stokta ürün yok."),
 "adjustTitle":("Stock adjustment","تعديل المخزون","Stok düzeltmesi"),
 "adjustHint":("For counts, damage or scrapping rejected goods. Every adjustment is logged with your name and reason.","للجرد أو التلف أو إتلاف المرفوض. يُسجل كل تعديل باسمك والسبب.","Sayım, hasar veya ret ürün imhası için. Her düzeltme adınız ve nedenle kaydedilir."),
 "saveAdjustment":("Save adjustment","حفظ التعديل","Düzeltmeyi kaydet"),
 "stockState":("Stock state","حالة المخزون","Stok durumu"),
 "adjustQty":("Quantity + / −","الكمية + / −","Miktar + / −"),
 "adjustKind":("Type","النوع","Tür"),
 "nothingAwaiting":("Nothing is waiting for receipt.","لا شيء بانتظار الاستلام.","Kabul bekleyen yok."),
 "receive":("Receive","استلام","Kabul et"),
 "receipt":("Receipt","الاستلام","Kabul"),
 "by":("By","بواسطة","Yapan"),
 "allTypes":("All movement types","كل أنواع الحركات","Tüm hareket türleri"),
 "type":("Type","النوع","Tür"),
 "newLocation":("New storage location","موقع تخزين جديد","Yeni depo yeri"),
 "locationName":("Location name","اسم الموقع","Yer adı"),
 "receiptsCount":("{n} receipts","{n} استلام","{n} kabul"),
 "receiveTitle":("Receive finished goods","استلام البضائع الجاهزة","Mamul kabul"),
 "received":("{number} saved.","تم حفظ {number}.","{number} kaydedildi."),
 "receivedQuarantine":("{number} saved — {n} pcs went to quarantine because of the batch's QC status.","تم حفظ {number} — ذهبت {n} قطعة إلى الحجر بسبب حالة الجودة للدفعة.","{number} kaydedildi — partinin KK durumu nedeniyle {n} adet karantinaya alındı."),
 "waiting":("{n} pcs waiting","{n} قطعة بالانتظار","{n} adet bekliyor"),
 "willQuarantine":("will be placed in quarantine","ستوضع في الحجر","karantinaya alınacak"),
 "qtyReceived":("Quantity received","الكمية المستلمة","Kabul edilen miktar"),
 "location":("Location","الموقع","Yer"),
 "overReason":("Why is the count higher than production reported?","لماذا العدد أكبر مما سجله الإنتاج؟","Sayım neden üretimin bildirdiğinden fazla?"),
 "overHint":("Production reported {n} pcs still to receive.","سجل الإنتاج {n} قطعة متبقية للاستلام.","Üretime göre kabul edilecek {n} adet kaldı."),
 "overBlocked":("Only {n} pcs are waiting. A supervisor must approve a higher count.","فقط {n} قطعة بالانتظار. يجب أن يوافق مشرف على عدد أكبر.","Sadece {n} adet bekliyor. Daha fazlası için amir onayı gerekir."),
 "confirmReceipt":("Confirm receipt","تأكيد الاستلام","Kabulü onayla"),
}
for k,v in wh.items(): add(f"wh.{k}",*v)
for k,v in {"stock":("Stock","المخزون","Stok"),"awaiting":("Awaiting receipt","بانتظار الاستلام","Kabul bekleyen"),"receipts":("Receipts","الاستلامات","Kabuller"),"movements":("Movements","الحركات","Hareketler"),"locations":("Locations","المواقع","Yerler")}.items(): add(f"wh.tab.{k}",*v)
for k,v in {"COUNT":("Count correction","تصحيح جرد","Sayım düzeltme"),"DAMAGE":("Damaged","تالف","Hasarlı"),"SCRAP":("Scrapped","إتلاف","Hurda"),"OTHER":("Other","أخرى","Diğer")}.items(): add(f"wh.kind.{k}",*v)
for k,v in {"RECEIPT":("Receipt","استلام","Kabul"),"RESERVE":("Reserved for shipment","حجز لشحنة","Sevkiyata ayrıldı"),"UNRESERVE":("Reservation released","إلغاء الحجز","Ayırma kaldırıldı"),"SHIP":("Shipped","شحن","Sevk"),"QC_SYNC":("Quality decision","قرار الجودة","Kalite kararı"),"ADJUST":("Adjustment","تعديل","Düzeltme"),"SCRAP":("Scrap","إتلاف","Hurda")}.items(): add(f"wh.mv.{k}",*v)
for k,v in {"AVAILABLE":("Available","متاح","Kullanılabilir"),"RESERVED":("Reserved","محجوز لشحنة","Ayrılmış"),"QUARANTINE":("Quarantine","حجر","Karantina"),"REJECTED":("Rejected","مرفوض","Ret"),"SHIPPED":("Shipped","مشحون","Sevk edildi")}.items(): add(f"status.stock.{k}",*v)
for k,v in {"DRAFT":("Draft — stock reserved","مسودة — المخزون محجوز","Taslak — stok ayrıldı"),"CONFIRMED":("Dispatched","تم الشحن","Sevk edildi"),"CANCELLED":("Cancelled","ملغاة","İptal")}.items(): add(f"status.ship.{k}",*v)
ship = {
 "new":("New shipment","شحنة جديدة","Yeni sevkiyat"),
 "search":("Shipment, delivery note, order or customer…","الشحنة، إشعار التسليم، الطلب أو العميل…","Sevkiyat, irsaliye, sipariş veya müşteri…"),
 "notCancelled":("Not cancelled","غير الملغاة","İptal olmayanlar"),
 "newHint":("Only approved, unreserved stock can be shipped.","يمكن شحن المخزون المعتمد غير المحجوز فقط.","Yalnızca onaylı ve ayrılmamış stok sevk edilebilir."),
 "nothingToShip":("No order has approved stock ready to ship.","لا يوجد طلب لديه مخزون معتمد جاهز للشحن.","Sevke hazır onaylı stoğu olan sipariş yok."),
 "orderWithStock":("Order (with stock ready)","الطلب (مع مخزون جاهز)","Sipariş (stoğu hazır)"),
 "lineFacts":("Ordered {ordered} · shipped {shipped} · in drafts {drafts} · still to deliver {open}","مطلوب {ordered} · مشحون {shipped} · في المسودات {drafts} · متبقٍ للتسليم {open}","Sipariş {ordered} · sevk {shipped} · taslakta {drafts} · kalan {open}"),
 "fillFifo":("Fill oldest first","تعبئة الأقدم أولاً","Önce en eski"),
 "noStockLine":("No stock for this product yet.","لا يوجد مخزون لهذا المنتج بعد.","Bu ürün için henüz stok yok."),
 "availableN":("{n} available","{n} متاح","{n} kullanılabilir"),
 "blockedN":("{n} blocked","{n} محجوب","{n} bloke"),
 "lineTotal":("This line: {n} pcs","هذا البند: {n} قطعة","Bu kalem: {n} adet"),
 "overOpen":("more than the {n} still to deliver","أكثر من {n} المتبقية للتسليم","teslim edilecek {n} adetten fazla"),
 "plannedDate":("Planned dispatch date","تاريخ الشحن المخطط","Planlanan sevk tarihi"),
 "vehicle":("Vehicle / plate","المركبة / اللوحة","Araç / plaka"),
 "driver":("Driver","السائق","Şoför"),
 "reserveHint":("Saving reserves this stock for the shipment. Stock leaves the warehouse only when the dispatch is confirmed.","الحفظ يحجز هذا المخزون للشحنة. لا يخرج المخزون إلا عند تأكيد الشحن.","Kaydetmek stoğu bu sevkiyata ayırır. Stok yalnızca sevk onaylanınca depodan çıkar."),
 "createDraft":("Reserve stock & create shipment","حجز المخزون وإنشاء الشحنة","Stoğu ayır ve sevkiyat oluştur"),
 "confirmTitle":("Confirm dispatch","تأكيد الشحن","Sevki onayla"),
 "confirmHint":("Stock is deducted and the order updated in one step. If anything has changed (e.g. a QC hold), nothing is changed.","يُخصم المخزون ويُحدث الطلب في خطوة واحدة. إذا تغير شيء (مثل حجز الجودة) لا يتغير أي شيء.","Stok düşülür ve sipariş tek adımda güncellenir. Bir şey değiştiyse (örn. KK bekletmesi) hiçbir şey değişmez."),
 "deliveryNote":("Delivery note no.","رقم إشعار التسليم","İrsaliye no"),
 "deliveryNoteHint":("Leave empty to number it automatically","اتركه فارغاً للترقيم التلقائي","Otomatik numara için boş bırakın"),
 "confirmDispatch":("Confirm dispatch","تأكيد الشحن","Sevki onayla"),
 "confirmedMsg":("Dispatched. Stock and order updated.","تم الشحن. حُدّث المخزون والطلب.","Sevk edildi. Stok ve sipariş güncellendi."),
 "cancelReason":("Reason for cancelling","سبب الإلغاء","İptal nedeni"),
 "cancel":("Cancel shipment","إلغاء الشحنة","Sevkiyatı iptal et"),
 "cancelledMsg":("Cancelled — reserved stock released.","أُلغيت — حُرر المخزون المحجوز.","İptal edildi — ayrılan stok serbest."),
 "printNote":("Print delivery note","طباعة إشعار التسليم","İrsaliye yazdır"),
 "problems":("Quality Control blocked {batches} after it was reserved. Cancel this draft and create a new one.","حجبت الجودة {batches} بعد حجزها. ألغِ هذه المسودة وأنشئ واحدة جديدة.","KK, ayrıldıktan sonra {batches} partisini bloke etti. Bu taslağı iptal edip yenisini oluşturun."),
 "shippedAt":("Dispatched","وقت الشحن","Sevk zamanı"),
 "confirmedBy":("Confirmed by","أكده","Onaylayan"),
 "total":("Total","المجموع","Toplam"),
 "print":("Print","طباعة","Yazdır"),
 "deliveryNoteTitle":("Delivery note","إشعار تسليم","İrsaliye"),
 "shipment":("Shipment","الشحنة","Sevkiyat"),
 "signWarehouse":("Warehouse","المستودع","Depo"),
 "signDriver":("Driver","السائق","Şoför"),
 "signCustomer":("Received by customer","استلمه العميل","Müşteri teslim aldı"),
}
for k,v in ship.items(): add(f"ship.{k}",*v)
for k,v in {
 "warehouse.receive":("Goods received","استُلمت بضائع","Mal kabul edildi"),"stock.adjust":("Stock adjusted","عُدّل المخزون","Stok düzeltildi"),
 "shipment.create":("Shipment drafted, stock reserved","مسودة شحنة، حُجز المخزون","Sevkiyat taslağı, stok ayrıldı"),
 "shipment.confirm":("Shipment dispatched","تم شحن الشحنة","Sevkiyat yapıldı"),"shipment.cancel":("Shipment cancelled","أُلغيت الشحنة","Sevkiyat iptal edildi"),
}.items(): add(f"history.{k}",*v)
for i,loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[i]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3")
