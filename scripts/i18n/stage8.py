import json
S={}
def add(path,en,ar,tr): S[path]=(en,ar,tr)
def group(prefix, d):
    for k,v in d.items(): add(f"{prefix}.{k}",*v)

group("sys", {
 "tab":("System","النظام","Sistem"),
 "resetTitle":("Clear test data before going live","مسح بيانات التجربة قبل التشغيل الفعلي","Canlıya geçmeden önce test verilerini temizle"),
 "resetIntro":("Use this once, when testing is finished and the factory starts using the system for real. It permanently deletes these records:","استخدم هذا مرة واحدة عند انتهاء التجربة وبدء استخدام النظام فعلياً. يحذف هذه السجلات نهائياً:","Bunu test bittiğinde ve fabrika sistemi gerçekten kullanmaya başladığında bir kez kullanın. Şu kayıtları kalıcı olarak siler:"),
 "kept":("Always kept:","يبقى دائماً:","Her zaman korunur:"),
 "keptList":("employees and their logins, roles and permissions, departments, defect types, storage locations and the audit log. Numbering starts again from 0001.","الموظفون وحساباتهم، الأدوار والصلاحيات، الأقسام، أنواع العيوب، مواقع التخزين وسجل التدقيق. يبدأ الترقيم من 0001 مجدداً.","çalışanlar ve girişleri, roller ve yetkiler, departmanlar, hata türleri, depo yerleri ve denetim kaydı. Numaralandırma 0001'den yeniden başlar."),
 "scope":("What to delete","ما الذي سيُحذف","Ne silinecek"),
 "scopeOps":("Test transactions only (recommended)","معاملات التجربة فقط (موصى به)","Yalnızca test işlemleri (önerilen)"),
 "scopeOpsHint":("Orders, schedules, production, maintenance, QC, stock and shipments. Customers, products, machines and molds stay.","الطلبات والجداول والإنتاج والصيانة والجودة والمخزون والشحنات. يبقى العملاء والمنتجات والآلات والقوالب.","Siparişler, planlar, üretim, bakım, KK, stok ve sevkiyatlar. Müşteriler, ürünler, makineler ve kalıplar kalır."),
 "scopeAll":("Everything, including master data","كل شيء بما في ذلك البيانات الأساسية","Ana veriler dahil her şey"),
 "scopeAllHint":("Also deletes {customers} customers, {products} products, {machines} machines and {molds} molds.","يحذف أيضاً {customers} عميل و{products} منتج و{machines} آلة و{molds} قالب.","Ayrıca {customers} müşteri, {products} ürün, {machines} makine ve {molds} kalıbı siler."),
 "warning":("This cannot be undone. Make sure a backup exists first (see the backup guide).","لا يمكن التراجع عن هذا. تأكد أولاً من وجود نسخة احتياطية (راجع دليل النسخ الاحتياطي).","Bu geri alınamaz. Önce bir yedek olduğundan emin olun (yedekleme kılavuzuna bakın)."),
 "typeReset":("Type RESET to confirm","اكتب RESET للتأكيد","Onaylamak için RESET yazın"),
 "yourPassword":("Your password","كلمة المرور الخاصة بك","Şifreniz"),
 "working":("Deleting…","جارٍ الحذف…","Siliniyor…"),
 "resetButton":("Delete test transactions","حذف معاملات التجربة","Test işlemlerini sil"),
 "resetAllButton":("Delete everything","حذف كل شيء","Her şeyi sil"),
 "resetDone":("Done. The system is clean and ready for real use. This reset is recorded in the audit log.","تم. النظام نظيف وجاهز للاستخدام الفعلي. سُجّلت هذه العملية في سجل التدقيق.","Tamam. Sistem temiz ve gerçek kullanıma hazır. Bu sıfırlama denetim kaydına yazıldı."),
 "demoTitle":("Demo employee accounts","حسابات الموظفين التجريبية","Demo çalışan hesapları"),
 "demoIntro":("{n} demo accounts (usernames starting with demo.) exist. Remove them before going live.","يوجد {n} حساب تجريبي (أسماء تبدأ بـ demo.). احذفها قبل التشغيل الفعلي.","{n} demo hesap var (demo. ile başlayan). Canlıya geçmeden önce kaldırın."),
 "demoButton":("Remove demo accounts","حذف الحسابات التجريبية","Demo hesapları kaldır"),
 "demoDone":("Demo accounts removed.","حُذفت الحسابات التجريبية.","Demo hesaplar kaldırıldı."),
})
group("sys.count", {
 "orders":("Orders","الطلبات","Siparişler"),"jobs":("Production jobs","أوامر الإنتاج","Üretim işleri"),"batches":("Batches","الدفعات","Partiler"),
 "entries":("Quantity reports","تقارير الكميات","Miktar bildirimleri"),"downtime":("Downtime records","سجلات التوقف","Duruş kayıtları"),
 "maintenance":("Maintenance requests","طلبات الصيانة","Bakım talepleri"),"serviceReports":("Service reports","تقارير الخدمة","Servis raporları"),
 "inspections":("QC inspections","فحوصات الجودة","KK muayeneleri"),"issues":("Quality issues","مشاكل الجودة","Kalite sorunları"),
 "receipts":("Warehouse receipts","استلامات المستودع","Depo kabulleri"),"movements":("Stock movements","حركات المخزون","Stok hareketleri"),"shipments":("Shipments","الشحنات","Sevkiyatlar"),
})
group("history", {"system.reset":("Test data cleared","مُسحت بيانات التجربة","Test verileri temizlendi"),"system.remove_demo_users":("Demo accounts removed","حُذفت الحسابات التجريبية","Demo hesaplar kaldırıldı")})
group("audit.entity", {"System":("System","النظام","Sistem")})
group("history", {
 "auth.login":("Signed in","تسجيل دخول","Giriş yaptı"),"auth.password_change":("Password changed","تغيير كلمة المرور","Şifre değiştirildi"),
 "setup.first_admin":("First administrator created","أُنشئ أول مسؤول","İlk yönetici oluşturuldu"),
 "user.create":("Employee added","أُضيف موظف","Çalışan eklendi"),"user.update":("Employee updated","عُدّل موظف","Çalışan güncellendi"),
 "user.password_reset":("Password reset by admin","أعاد المسؤول تعيين كلمة المرور","Yönetici şifreyi sıfırladı"),
 "user.enable":("Employee enabled","فُعّل الموظف","Çalışan etkinleştirildi"),"user.disable":("Employee disabled","عُطّل الموظف","Çalışan devre dışı"),
 "role.create":("Role created","أُنشئ دور","Rol oluşturuldu"),"role.delete":("Role deleted","حُذف دور","Rol silindi"),"role.permissions":("Role permissions changed","تغيّرت صلاحيات الدور","Rol yetkileri değişti"),
 "customer.create":("Customer added","أُضيف عميل","Müşteri eklendi"),"customer.update":("Customer updated","عُدّل عميل","Müşteri güncellendi"),
 "customer.archive":("Customer archived","أُرشف عميل","Müşteri arşivlendi"),"customer.restore":("Customer restored","استُعيد عميل","Müşteri geri alındı"),
 "product.create":("Product added","أُضيف منتج","Ürün eklendi"),"product.update":("Product updated","عُدّل منتج","Ürün güncellendi"),
 "product.archive":("Product archived","أُرشف منتج","Ürün arşivlendi"),"product.restore":("Product restored","استُعيد منتج","Ürün geri alındı"),
 "machine.create":("Machine added","أُضيفت آلة","Makine eklendi"),"machine.update":("Machine updated","عُدّلت آلة","Makine güncellendi"),
 "machine.archive":("Machine archived","أُرشفت آلة","Makine arşivlendi"),"machine.restore":("Machine restored","استُعيدت آلة","Makine geri alındı"),
 "mold.create":("Mold added","أُضيف قالب","Kalıp eklendi"),"mold.update":("Mold updated","عُدّل قالب","Kalıp güncellendi"),
 "mold.archive":("Mold archived","أُرشف قالب","Kalıp arşivlendi"),"mold.restore":("Mold restored","استُعيد قالب","Kalıp geri alındı"),
 "location.save":("Storage location saved","حُفظ موقع تخزين","Depo yeri kaydedildi"),"preventive.done":("Preventive task done","أُنجزت مهمة وقائية","Önleyici görev yapıldı"),
 "service.report":("Service report filed","قُدّم تقرير خدمة","Servis raporu girildi"),
})
group("common", {"delete":("Delete","حذف","Sil"),"deleteConfirm":("Delete {name} permanently? This only works if it has never been used.","حذف {name} نهائياً؟ يعمل هذا فقط إذا لم يُستخدم أبداً.","{name} kalıcı olarak silinsin mi? Yalnızca hiç kullanılmadıysa mümkündür.")})
group("order", {
 "deletedMsg":("Order deleted. The deletion is recorded in the audit log.","حُذف الطلب. سُجّل الحذف في سجل التدقيق.","Sipariş silindi. Silme işlemi denetim kaydına yazıldı."),
 "addMany":("Add several products","إضافة عدة منتجات","Birden çok ürün ekle"),
 "addManyTitle":("Tick the products to add — then type each quantity","حدد المنتجات المراد إضافتها — ثم اكتب كمية كل منها","Eklenecek ürünleri işaretleyin — sonra miktarlarını yazın"),
 "addSelected":("Add {n} products","إضافة {n} منتج","{n} ürün ekle"),
})
group("order.act", {"delete":("Delete order","حذف الطلب","Siparişi sil"),"deleteHelp":("Only for orders entered by mistake, before any production. The order disappears completely; a record of who deleted it and why stays in the audit log.","فقط للطلبات المُدخلة بالخطأ قبل أي إنتاج. يختفي الطلب كلياً؛ ويبقى سجل بمن حذفه ولماذا في سجل التدقيق.","Yalnızca yanlışlıkla girilen, üretim başlamamış siparişler için. Sipariş tamamen silinir; kimin neden sildiği denetim kaydında kalır.")})
group("daily", {
 "title":("Daily entry sheet","ورقة الإدخال اليومي","Günlük giriş sayfası"),
 "subtitle":("{date} · {n} jobs running or due today. Type the quantities and save once.","{date} · {n} أمر قيد التشغيل أو مستحق اليوم. اكتب الكميات واحفظ مرة واحدة.","{date} · bugün çalışan veya vadesi gelen {n} iş. Miktarları yazın ve bir kez kaydedin."),
 "none":("No jobs are running or planned for today.","لا توجد أوامر قيد التشغيل أو مخططة لليوم.","Bugün çalışan veya planlanan iş yok."),
 "filter":("Filter by machine, job, product or order…","تصفية حسب الآلة أو الأمر أو المنتج أو الطلب…","Makine, iş, ürün veya siparişe göre süz…"),
 "shift":("Shift","الوردية","Vardiya"),
 "newBatch":("Start a new batch (lot) for each job","بدء دفعة جديدة لكل أمر","Her iş için yeni parti başlat"),
 "colJob":("Machine · job · product","الآلة · الأمر · المنتج","Makine · iş · ürün"),
 "colProgress":("Made / planned","المنتج / المخطط","Üretilen / planlanan"),
 "todaySoFar":("{n} today so far","{n} اليوم حتى الآن","bugün şimdiye kadar {n}"),
 "willStart":("Starts when you save","يبدأ عند الحفظ","Kaydedince başlar"),
 "machineDown":("Machine down","الآلة متوقفة","Makine arızalı"),
 "summary":("{jobs} jobs · {pcs} good pieces to save","{jobs} أمر · {pcs} قطعة سليمة للحفظ","{jobs} iş · kaydedilecek {pcs} sağlam adet"),
 "saveAll":("Save all","حفظ الكل","Tümünü kaydet"),
 "finished":("Finished","انتهى","Bitti"),
 "completed":("{n} jobs marked finished.","{n} أمر انتهى.","{n} iş bitti olarak işaretlendi."),
 "saved":("Saved {n} jobs, {pcs} good pieces.","حُفظ {n} أمر، {pcs} قطعة سليمة.","{n} iş, {pcs} sağlam adet kaydedildi."),
 "started":("{n} planned jobs were started.","بدأ {n} أمر مخطط.","{n} planlı iş başlatıldı."),
 "notSaved":("{n} not saved — fix and save again:","{n} لم تُحفظ — صحّحها واحفظ مجدداً:","{n} kaydedilmedi — düzeltip tekrar kaydedin:"),
})
group("history", {"order.delete":("Order deleted","حُذف الطلب","Sipariş silindi"),"customer.delete":("Customer deleted","حُذف عميل","Müşteri silindi"),"product.delete":("Product deleted","حُذف منتج","Ürün silindi"),"machine.delete":("Machine deleted","حُذفت آلة","Makine silindi"),"mold.delete":("Mold deleted","حُذف قالب","Kalıp silindi")})

for i,loc in enumerate(["en","ar","tr"]):
    p=f"messages/{loc}.json"; d=json.load(open(p,encoding="utf-8"))
    for path,vals in S.items():
        node=d; parts=path.split(".")
        for part in parts[:-1]: node=node.setdefault(part,{})
        node[parts[-1]]=vals[i]
    json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
print(len(S),"strings x 3")
