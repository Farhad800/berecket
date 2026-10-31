"""Employee Management: workers, shifts, attendance, excuses, penalties, departures, blacklist, payroll (owner, 31 Oct 2026)."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)

group("nav", {
    "people": ("Employees", "الموظفون", "Çalışanlar"),
    "workers": ("Employees", "الموظفون", "Çalışanlar"),
    "attendance": ("Daily Attendance", "الحضور اليومي", "Günlük Yoklama"),
    "payroll": ("Monthly Payroll", "الرواتب الشهرية", "Aylık Bordro"),
    "employees": ("System users", "مستخدمو النظام", "Sistem kullanıcıları"),
})
group("perm.resources", {
    "workers": ("Employees (factory workers)", "الموظفون (عمال المعمل)", "Çalışanlar (fabrika işçileri)"),
    "attendance": ("Daily attendance", "الحضور اليومي", "Günlük yoklama"),
    "penalties": ("Penalties", "الغرامات", "Cezalar"),
    "blacklist": ("Blacklist", "القائمة السوداء", "Kara liste"),
    "payroll": ("Payroll (salaries)", "الرواتب", "Bordro (maaşlar)"),
})
add("perm.actions.salary", "Change salary", "تغيير الراتب", "Maaşı değiştir")

group("wk.tab", {
    "active": ("Active Employees", "الموظفون النشطون", "Aktif Çalışanlar"),
    "inactive": ("Inactive Employees", "الموظفون غير النشطين", "Pasif Çalışanlar"),
    "blacklist": ("Blacklisted Employees", "القائمة السوداء", "Kara Listedekiler"),
    "shifts": ("Shift Management", "إدارة الورديات", "Vardiya Yönetimi"),
    "attendance": ("Daily Attendance", "الحضور اليومي", "Günlük Yoklama"),
    "excuses": ("Excused Absences", "الغيابات بعذر", "Mazeretli Devamsızlık"),
    "penalties": ("Penalties", "الغرامات", "Cezalar"),
    "payroll": ("Monthly Payroll", "الرواتب الشهرية", "Aylık Bordro"),
    "sheets": ("Printable Salary Sheets", "كشوف الرواتب للطباعة", "Yazdırılabilir Maaş Listeleri"),
    "history": ("Payroll History", "سجل الرواتب", "Bordro Geçmişi"),
})
group("wk.att", {"PRESENT": ("Present", "حاضر", "Var"), "ABSENT": ("Absent", "غائب", "Yok"), "EXCUSED": ("Excused", "غياب بعذر", "Mazeretli")})
group("wk.excuse", {"WAITING": ("waiting for approval", "بانتظار الموافقة", "onay bekliyor"), "APPROVED": ("approved", "مقبول", "onaylandı"), "REJECTED": ("rejected — counted as absent", "مرفوض — يُحسب غياباً", "reddedildi — devamsızlık sayıldı"), "REVOKED": ("revoked — counted as absent", "مسحوب — يُحسب غياباً", "geri alındı — devamsızlık sayıldı")})
group("wk.appr", {"WAITING": ("waiting", "بالانتظار", "bekliyor"), "APPROVED": ("approved", "موافق عليه", "onaylandı"), "REJECTED": ("rejected", "مرفوض", "reddedildi")})
group("wk.kind", {"FIRED": ("Fired", "مفصول", "İşten çıkarıldı"), "QUIT": ("Quit", "استقال", "Ayrıldı")})
group("wk.status", {"ACTIVE": ("Active", "نشط", "Aktif"), "INACTIVE": ("Inactive", "غير نشط", "Pasif")})
group("wk.same", {"name": ("same name", "نفس الاسم", "aynı ad"), "phone": ("same phone", "نفس الهاتف", "aynı telefon")})
group("wk.run", {"DRAFT": ("Draft", "مسودة", "Taslak"), "SUBMITTED": ("Submitted", "مُرسلة للمدير", "Gönderildi"), "APPROVED": ("Approved", "موافق عليها", "Onaylandı"), "FINALIZED": ("Finalized", "نهائية", "Kesinleşti")})
group("wk.col", {
    "employee": ("Employee", "الموظف", "Çalışan"), "salary": ("Monthly salary", "الراتب الشهري", "Aylık maaş"), "daysWorked": ("Days worked", "أيام العمل", "Çalışılan gün"),
    "absent": ("Absent", "غياب", "Devamsız"), "excused": ("Excused", "بعذر", "Mazeretli"), "extra": ("Extra days", "أيام إضافية", "Ek gün"),
    "deductionDays": ("Deduction days", "أيام الخصم", "Kesinti günü"), "dailyRate": ("Daily rate", "أجر اليوم", "Günlük ücret"), "absenceDed": ("Absence deduction", "خصم الغياب", "Devamsızlık kesintisi"),
    "penalties": ("Penalties", "الغرامات", "Cezalar"), "totalDed": ("Total deductions", "مجموع الخصومات", "Toplam kesinti"), "final": ("Final salary", "الراتب النهائي", "Net maaş"),
})
group("wk.sheet", {
    "no": ("No.", "ت", "No"), "name": ("Employee Name", "اسم الموظف", "Çalışan Adı"), "id": ("Employee ID", "رقم الموظف", "Çalışan No"), "days": ("Days Worked", "أيام العمل", "Çalışılan Gün"),
    "final": ("Final Salary (IQD)", "الراتب النهائي (دينار)", "Net Maaş (IQD)"), "signature": ("Employee Signature", "توقيع الموظف", "Çalışan İmzası"),
    "total": ("Total — {n} employees", "المجموع — {n} موظف", "Toplam — {n} çalışan"), "manager": ("Manager approval", "موافقة المدير", "Müdür onayı"),
    "accountant": ("Accountant", "المحاسب", "Muhasebeci"), "sign": ("Signature", "التوقيع", "İmza"), "name2": ("Name", "الاسم", "Ad"), "approvalDate": ("Approval date", "تاريخ الموافقة", "Onay tarihi"), "date": ("Date", "التاريخ", "Tarih"),
    "note": ("This sheet is an acknowledgment of salary received; printing it does not record any payment.", "هذا الكشف إقرار باستلام الراتب؛ طباعته لا تسجّل أي دفع.", "Bu liste maaş alındı belgesidir; yazdırmak herhangi bir ödeme kaydetmez."),
})
group("wk", {
    "intro": ("Factory employees on the three shifts. They don't log in; team leaders report absences and penalties.", "عمال المعمل في الورديات الثلاث. لا يسجّلون الدخول؛ قادة الورديات يسجّلون الغياب والغرامات.", "Üç vardiyadaki fabrika çalışanları. Giriş yapmazlar; vardiya amirleri devamsızlık ve cezaları girer."),
    "add": ("Add employee", "إضافة موظف", "Çalışan ekle"),
    "addIntro": ("Five fields. The employee number is given automatically; the salary starts at 400,000 IQD.", "خمسة حقول. رقم الموظف يُعطى تلقائياً؛ الراتب يبدأ بـ 400,000 دينار.", "Beş alan. Çalışan numarası otomatik verilir; maaş 400.000 IQD ile başlar."),
    "noShift": ("You are not the team leader of a shift yet. Ask the administrator to set you as a shift's leader (Shift Management).", "لست قائد وردية بعد. اطلب من المدير تعيينك قائداً لوردية (إدارة الورديات).", "Henüz bir vardiyanın amiri değilsiniz. Yöneticiden sizi bir vardiyaya amir yapmasını isteyin (Vardiya Yönetimi)."),
    "shiftN": ("Shift {n}", "الوردية {n}", "Vardiya {n}"),
    "search": ("Name, number or phone…", "الاسم أو الرقم أو الهاتف…", "Ad, numara veya telefon…"),
    "allShifts": ("All shifts", "كل الورديات", "Tüm vardiyalar"),
    "none": ("No active employees.", "لا يوجد موظفون نشطون.", "Aktif çalışan yok."),
    "since": ("since {date}", "منذ {date}", "{date} tarihinden beri"),
    "fullName": ("Full name", "الاسم الكامل", "Ad soyad"),
    "shift": ("Shift", "الوردية", "Vardiya"),
    "salary": ("Monthly salary (IQD)", "الراتب الشهري (دينار)", "Aylık maaş (IQD)"),
    "salaryHint": ("400,000 IQD by default.", "400,000 دينار افتراضياً.", "Varsayılan 400.000 IQD."),
    "salaryFixed": ("Every new employee starts at 400,000 IQD; only the administrator changes salaries.", "كل موظف جديد يبدأ بـ 400,000 دينار؛ المدير وحده يغيّر الرواتب.", "Her yeni çalışan 400.000 IQD ile başlar; maaşları yalnızca yönetici değiştirir."),
    "startDate": ("Start date", "تاريخ البدء", "Başlangıç tarihi"),
    "phone": ("Phone number", "رقم الهاتف", "Telefon numarası"),
    "numberAuto": ("The employee number (W-0001…) is given automatically.", "رقم الموظف (W-0001…) يُعطى تلقائياً.", "Çalışan numarası (W-0001…) otomatik verilir."),
    "matchFound": ("Someone with this name or phone was already in the system. Check before adding:", "يوجد شخص بهذا الاسم أو الهاتف في النظام. تحقق قبل الإضافة:", "Bu ad veya telefonla biri sistemde zaten var. Eklemeden önce kontrol edin:"),
    "matchBlack": ("WARNING — this name or phone is on the blacklist:", "تحذير — هذا الاسم أو الهاتف في القائمة السوداء:", "UYARI — bu ad veya telefon kara listede:"),
    "blacklisted": ("Blacklisted", "في القائمة السوداء", "Kara listede"),
    "sameAs": ("{what}", "{what}", "{what}"),
    "blackReason": ("Reason", "السبب", "Sebep"),
    "reviewed": ("I reviewed this and still want to add the employee", "راجعت ذلك وما زلت أريد إضافة الموظف", "Bunu inceledim ve yine de çalışanı eklemek istiyorum"),
    "save": ("Add employee", "إضافة الموظف", "Çalışanı ekle"),
    "saved": ("Employee {number} saved.", "تم حفظ الموظف {number}.", "{number} çalışanı kaydedildi."),
    "number": ("Employee number", "رقم الموظف", "Çalışan no"),
    "lastDay": ("Last working day", "آخر يوم عمل", "Son çalışma günü"),
    "edit": ("Edit details", "تعديل البيانات", "Bilgileri düzenle"),
    "transfer": ("Move to another shift", "نقل إلى وردية أخرى", "Başka vardiyaya taşı"),
    "newShift": ("New shift", "الوردية الجديدة", "Yeni vardiya"),
    "reasonOpt": ("Reason (optional)", "السبب (اختياري)", "Sebep (isteğe bağlı)"),
    "reason": ("Reason", "السبب", "Sebep"),
    "changeSalary": ("Change salary", "تغيير الراتب", "Maaşı değiştir"),
    "salaryRule": ("Counts from next month's payroll; already submitted or finalized months never change.", "يُحتسب من رواتب الشهر القادم؛ الأشهر المرسلة أو النهائية لا تتغيّر.", "Gelecek ayın bordrosundan itibaren geçerli; gönderilmiş veya kesinleşmiş aylar değişmez."),
    "newSalary": ("New monthly salary (IQD)", "الراتب الشهري الجديد (دينار)", "Yeni aylık maaş (IQD)"),
    "penaltyAdd": ("Give a penalty", "إعطاء غرامة", "Ceza ver"),
    "penaltySave": ("Save penalty", "حفظ الغرامة", "Cezayı kaydet"),
    "penaltySaved": ("Penalty saved.", "تم حفظ الغرامة.", "Ceza kaydedildi."),
    "amount": ("Amount (IQD)", "المبلغ (دينار)", "Tutar (IQD)"),
    "date": ("Date", "التاريخ", "Tarih"),
    "depart": ("Fired or quit", "فصل أو استقالة", "İşten çıkarma veya ayrılma"),
    "departHint": ("The employee leaves the attendance lists at once; the administrator confirms it.", "يخرج الموظف من قوائم الحضور فوراً؛ والمدير يؤكد ذلك.", "Çalışan yoklama listelerinden hemen çıkar; yönetici onaylar."),
    "departHintAdmin": ("The employee becomes inactive after the last working day. All history is kept.", "يصبح الموظف غير نشط بعد آخر يوم عمل. يُحفظ كل السجل.", "Çalışan son çalışma gününden sonra pasif olur. Tüm geçmiş saklanır."),
    "departQuit": ("Record: quit", "تسجيل: استقال", "Kaydet: ayrıldı"),
    "departFired": ("Record: fired", "تسجيل: مفصول", "Kaydet: çıkarıldı"),
    "departKind": ("Fired or quit", "مفصول أو استقال", "Çıkarıldı veya ayrıldı"),
    "departSave": ("Save departure", "حفظ المغادرة", "Ayrılışı kaydet"),
    "explanation": ("Explanation", "الشرح", "Açıklama"),
    "alsoBlack": ("Also add to the blacklist", "إضافته أيضاً إلى القائمة السوداء", "Kara listeye de ekle"),
    "blackReasonIfAdded": ("Blacklist reason (if added)", "سبب القائمة السوداء (إن أُضيف)", "Kara liste sebebi (eklenirse)"),
    "blackDetailsIfAdded": ("Blacklist details (if added)", "تفاصيل القائمة السوداء (إن أُضيف)", "Kara liste ayrıntıları (eklenirse)"),
    "blackAdd": ("Add to blacklist", "إضافة إلى القائمة السوداء", "Kara listeye ekle"),
    "blackDetails": ("Detailed explanation", "شرح مفصّل", "Ayrıntılı açıklama"),
    "absences": ("Absences", "الغيابات", "Devamsızlıklar"),
    "noAbsences": ("No absences.", "لا غيابات.", "Devamsızlık yok."),
    "extraLine": ("Extra deduction: +{days} day(s) → {total} deduction days for 1 absent day", "خصم إضافي: +{days} يوم → {total} أيام خصم ليوم غياب واحد", "Ek kesinti: +{days} gün → 1 devamsızlık günü için {total} kesinti günü"),
    "extraAsk": ("Count as more days", "احتسابه أياماً أكثر", "Daha fazla gün say"),
    "extraSend": ("Send for approval", "إرسال للموافقة", "Onaya gönder"),
    "extraDays": ("Extra deduction days", "أيام خصم إضافية", "Ek kesinti günü"),
    "noPenalties": ("No penalties.", "لا غرامات.", "Ceza yok."),
    "cancelled": ("Cancelled", "ملغاة", "İptal edildi"),
    "history": ("History", "السجل", "Geçmiş"),
    "blackRemoved": ("removed from the blacklist", "أُزيل من القائمة السوداء", "kara listeden çıkarıldı"),
    "moved": ("Moved from shift {from} to shift {to}", "نُقل من الوردية {from} إلى الوردية {to}", "{from}. vardiyadan {to}. vardiyaya taşındı"),
    "salaryFromTo": ("Salary {from} → {to}", "الراتب {from} ← {to}", "Maaş {from} → {to}"),
    "created": ("Added", "أُضيف", "Eklendi"),
    "inactiveIntro": ("Employees who were fired or quit. Nothing is deleted: their attendance, penalties and payroll stay.", "الموظفون المفصولون أو المستقيلون. لا يُحذف شيء: يبقى حضورهم وغراماتهم ورواتبهم.", "İşten çıkarılan veya ayrılan çalışanlar. Hiçbir şey silinmez: yoklama, ceza ve bordroları kalır."),
    "firedOrQuit": ("Fired or quit", "مفصول أو مستقيل", "Çıkarıldı veya ayrıldı"),
    "noneInactive": ("No inactive employees.", "لا يوجد موظفون غير نشطين.", "Pasif çalışan yok."),
    "waitingConfirm": ("waiting for the administrator", "بانتظار المدير", "yönetici bekleniyor"),
    "recordedBy": ("Recorded by {name}, {at}", "سجّله {name}، {at}", "Kaydeden: {name}, {at}"),
    "confirm": ("Confirm", "تأكيد", "Onayla"),
    "undo": ("Undo (employee active again)", "تراجع (الموظف نشط مجدداً)", "Geri al (çalışan yeniden aktif)"),
    "blackIntro": ("One list shared by all three shifts, so a team leader can check someone's history before hiring.", "قائمة واحدة مشتركة بين الورديات الثلاث، ليتحقق قائد الوردية من سجل أي شخص قبل توظيفه.", "Üç vardiyanın ortak tek listesi; amir işe almadan önce kişinin geçmişine bakabilir."),
    "blackAddOther": ("Add someone (name and phone)", "إضافة شخص (الاسم والهاتف)", "Birini ekle (ad ve telefon)"),
    "prevShift": ("Previous shift", "الوردية السابقة", "Önceki vardiya"),
    "blackSaved": ("Added to the blacklist.", "أُضيف إلى القائمة السوداء.", "Kara listeye eklendi."),
    "onList": ("On the list", "في القائمة", "Listede"),
    "blackRemovedList": ("Removed (history)", "المُزالون (السجل)", "Çıkarılanlar (geçmiş)"),
    "noneBlack": ("Nobody is on the blacklist.", "لا أحد في القائمة السوداء.", "Kara listede kimse yok."),
    "removalWaiting": ("removal waiting for the administrator", "الإزالة بانتظار المدير", "çıkarma yönetici onayı bekliyor"),
    "addedBy": ("Added by {name}, {at}", "أضافه {name}، {at}", "Ekleyen: {name}, {at}"),
    "removalReason": ("Removal reason", "سبب الإزالة", "Çıkarma sebebi"),
    "decidedBy": ("decided by {name}", "قرّره {name}", "karar veren: {name}"),
    "removalApprove": ("Approve removal", "الموافقة على الإزالة", "Çıkarmayı onayla"),
    "removalRefuse": ("Keep on the list", "إبقاؤه في القائمة", "Listede tut"),
    "removeAsk": ("Ask to remove", "طلب الإزالة", "Çıkarma iste"),
    "removeNow": ("Remove from the list", "إزالة من القائمة", "Listeden çıkar"),
    "shiftsIntro": ("Each shift has its own team leader. Only the administrator assigns leaders and moves employees.", "لكل وردية قائدها. المدير وحده يعيّن القادة وينقل الموظفين.", "Her vardiyanın kendi amiri vardır. Amirleri yalnızca yönetici atar ve çalışanları taşır."),
    "leader": ("Team leader", "قائد الوردية", "Vardiya amiri"),
    "noLeader": ("No leader", "بلا قائد", "Amir yok"),
    "setLeader": ("Change leader", "تغيير القائد", "Amiri değiştir"),
    "activeN": ("{n} active employees", "{n} موظف نشط", "{n} aktif çalışan"),
    "otherShift": ("Another shift's employees are visible to its own leader.", "موظفو الوردية الأخرى يراهم قائدها فقط.", "Diğer vardiyanın çalışanlarını yalnızca kendi amiri görür."),
    "attIntro": ("Tap only the employees who are absent. Everyone else is recorded present when you submit.", "اضغط فقط على الموظفين الغائبين. الباقون يُسجَّلون حاضرين عند الإرسال.", "Yalnızca gelmeyenlere dokunun. Gönderdiğinizde diğer herkes var olarak kaydedilir."),
    "attHint": ("Everyone is present unless marked Absent or Excused. Excused needs a reason.", "الجميع حاضرون ما لم يُعلَّموا غائبين أو بعذر. الغياب بعذر يحتاج سبباً.", "Yok veya Mazeretli işaretlenmedikçe herkes var sayılır. Mazeret için sebep gerekir."),
    "total": ("Total", "المجموع", "Toplam"),
    "excuseReason": ("Reason for the excuse", "سبب العذر", "Mazeret sebebi"),
    "correctReason": ("Why is the report corrected?", "لماذا يُصحَّح التقرير؟", "Rapor neden düzeltiliyor?"),
    "countLine": ("Present {present} · Absent {absent} · Excused {excused} · Total {total}", "حاضر {present} · غائب {absent} · بعذر {excused} · المجموع {total}", "Var {present} · Yok {absent} · Mazeretli {excused} · Toplam {total}"),
    "submit": ("Submit attendance", "إرسال الحضور", "Yoklamayı gönder"),
    "saveCorrection": ("Save correction", "حفظ التصحيح", "Düzeltmeyi kaydet"),
    "submitted": ("Attendance submitted.", "تم إرسال الحضور.", "Yoklama gönderildi."),
    "corrected": ("Correction saved.", "تم حفظ التصحيح.", "Düzeltme kaydedildi."),
    "reportFor": ("Shift {shift} · {date}", "الوردية {shift} · {date}", "Vardiya {shift} · {date}"),
    "submittedBadge": ("Submitted", "مُرسَل", "Gönderildi"),
    "submittedBy": ("by {name}, {at}", "بواسطة {name}، {at}", "{name}, {at}"),
    "correctedAt": ("corrected {at}", "صُحِّح {at}", "düzeltildi {at}"),
    "correct": ("Correct this report", "تصحيح هذا التقرير", "Bu raporu düzelt"),
    "noActive": ("There are no active employees in this shift for that day.", "لا يوجد موظفون نشطون في هذه الوردية لذلك اليوم.", "O gün bu vardiyada aktif çalışan yok."),
    "notSubmitted": ("Not Submitted — the team leader hasn't sent this day's report. Nobody is counted present or absent, and nothing is deducted.", "لم يُرسَل — لم يرسل قائد الوردية تقرير هذا اليوم. لا يُحسب أحد حاضراً أو غائباً ولا يُخصم شيء.", "Gönderilmedi — amir bu günün raporunu göndermedi. Kimse var/yok sayılmaz, kesinti yapılmaz."),
    "notSubmittedShort": ("Not Submitted", "لم يُرسَل", "Gönderilmedi"),
    "monthView": ("Month {month}", "الشهر {month}", "Ay {month}"),
    "gridHint": ("✓ = all present · a number = absent/excused that day · ! (red) = Not Submitted. Tap a day to open it.", "✓ = الجميع حاضر · رقم = الغائبون/بعذر ذلك اليوم · ! (أحمر) = لم يُرسَل. اضغط يوماً لفتحه.", "✓ = herkes var · sayı = o gün yok/mazeretli · ! (kırmızı) = Gönderilmedi. Açmak için güne dokunun."),
    "excusesIntro": ("Excused absences need a reason and an approval; extra deduction days count one absence as more days.", "الغياب بعذر يحتاج سبباً وموافقة؛ أيام الخصم الإضافية تحتسب غياباً واحداً كأيام أكثر.", "Mazeretli devamsızlık sebep ve onay ister; ek kesinti günleri bir devamsızlığı daha fazla gün sayar."),
    "waitingExcuses": ("Excuses waiting ({n})", "أعذار بالانتظار ({n})", "Bekleyen mazeretler ({n})"),
    "waitingExtra": ("Extra deduction days waiting ({n})", "أيام خصم إضافية بالانتظار ({n})", "Bekleyen ek kesinti günleri ({n})"),
    "nothingWaiting": ("Nothing waiting.", "لا شيء بالانتظار.", "Bekleyen yok."),
    "askedBy": ("asked by {name}", "طلبه {name}", "isteyen: {name}"),
    "approve": ("Approve", "موافقة", "Onayla"),
    "reject": ("Reject", "رفض", "Reddet"),
    "decided": ("Decided (last 2 months)", "المُقرَّرة (آخر شهرين)", "Karara bağlananlar (son 2 ay)"),
    "nothingDecided": ("Nothing decided yet.", "لم يُقرَّر شيء بعد.", "Henüz karar yok."),
    "revoke": ("Revoke excuse", "سحب العذر", "Mazereti geri al"),
    "penaltiesIntro": ("Money penalties in IQD. Changing or cancelling one needs a reason; nothing is deleted.", "غرامات مالية بالدينار. تغييرها أو إلغاؤها يحتاج سبباً؛ لا يُحذف شيء.", "IQD cinsinden para cezaları. Değiştirmek veya iptal etmek sebep ister; hiçbir şey silinmez."),
    "employee": ("Employee", "الموظف", "Çalışan"),
    "thisMonth": ("This month", "هذا الشهر", "Bu ay"),
    "penaltyTotal": ("{n} active penalties · {total}", "{n} غرامة فعّالة · {total}", "{n} etkin ceza · {total}"),
    "givenBy": ("Given by {name}, {at}", "أعطاها {name}، {at}", "Veren: {name}, {at}"),
    "change": ("Change", "تغيير", "Değiştir"),
    "cancel": ("Cancel penalty", "إلغاء الغرامة", "Cezayı iptal et"),
    "penaltyReason": ("Penalty reason", "سبب الغرامة", "Ceza sebebi"),
    "whyChange": ("Why is it changed?", "لماذا تُغيَّر؟", "Neden değiştiriliyor?"),
    "whyCancel": ("Why is it cancelled?", "لماذا تُلغى؟", "Neden iptal ediliyor?"),
    "payrollIntro": ("Monthly salary ÷ 30 per day. Final = salary − deduction days × daily rate − penalties, rounded to 250 IQD.", "الراتب الشهري ÷ 30 لليوم. النهائي = الراتب − أيام الخصم × أجر اليوم − الغرامات، مقرّباً إلى 250 دينار.", "Aylık maaş ÷ 30 günlük. Net = maaş − kesinti günü × günlük ücret − cezalar, 250 IQD'ye yuvarlanır."),
    "monthN": ("Month {n}", "الشهر {n}", "{n}. ay"),
    "payrollOf": ("Payroll {month}/{year}", "رواتب {month}/{year}", "Bordro {month}/{year}"),
    "frozenNote": ("Figures frozen when submitted — later changes don't touch them.", "الأرقام مجمّدة منذ الإرسال — التغييرات اللاحقة لا تمسّها.", "Rakamlar gönderildiğinde donduruldu — sonraki değişiklikler etkilemez."),
    "liveNote": ("Draft: worked out live from attendance, excuses and penalties.", "مسودة: تُحسب مباشرة من الحضور والأعذار والغرامات.", "Taslak: yoklama, mazeret ve cezalardan anlık hesaplanır."),
    "runSubmitted": ("Submitted by {name}, {at}", "أرسلها {name}، {at}", "Gönderen: {name}, {at}"),
    "runApproved": ("Approved by {name}, {at}", "وافق عليها {name}، {at}", "Onaylayan: {name}, {at}"),
    "runFinalized": ("Finalized by {name}, {at}", "جعلها نهائية {name}، {at}", "Kesinleştiren: {name}, {at}"),
    "sentBack": ("Sent back by the manager", "أعادها المدير", "Müdür geri gönderdi"),
    "submitPayroll": ("Submit to the manager", "إرسال إلى المدير", "Müdüre gönder"),
    "approvePayroll": ("Approve payroll", "الموافقة على الرواتب", "Bordroyu onayla"),
    "sendBack": ("Send back", "إعادة", "Geri gönder"),
    "finalize": ("Finalize payroll", "جعل الرواتب نهائية", "Bordroyu kesinleştir"),
    "employeesN": ("Employees", "الموظفون", "Çalışanlar"),
    "totalAbsence": ("Absence deductions (IQD)", "خصومات الغياب (دينار)", "Devamsızlık kesintileri (IQD)"),
    "totalPenalties": ("Penalties (IQD)", "الغرامات (دينار)", "Cezalar (IQD)"),
    "totalPayable": ("Total payable", "المجموع المستحق", "Toplam ödenecek"),
    "review": ("Review before submitting", "مراجعة قبل الإرسال", "Göndermeden önce kontrol"),
    "missingDays": ("{n} days Not Submitted:", "{n} أيام لم تُرسَل:", "{n} gün gönderilmedi:"),
    "open": ("Open", "فتح", "Aç"),
    "waitingDecisions": ("{n} excuses or extra deduction requests are still waiting (not deducted until decided)", "{n} أعذار أو طلبات خصم إضافي ما زالت بالانتظار (لا تُخصم حتى يُقرَّر)", "{n} mazeret veya ek kesinti talebi bekliyor (karar verilene kadar kesilmez)"),
    "reviewHint": ("Days Not Submitted are never deducted; they count as worked.", "الأيام التي لم تُرسَل لا تُخصم أبداً؛ تُحسب أيام عمل.", "Gönderilmeyen günler asla kesilmez; çalışılmış sayılır."),
    "shiftTotal": ("Shift total", "مجموع الوردية", "Vardiya toplamı"),
    "printSheet": ("Print salary sheet", "طباعة كشف الرواتب", "Maaş listesini yazdır"),
    "paidDays": ("paid {n} of 30 days", "مدفوع {n} من 30 يوماً", "30 günün {n} günü ödenir"),
    "waiting": ("waiting decisions", "قرارات بالانتظار", "bekleyen kararlar"),
    "correctedBadge": ("corrected", "مُصحَّح", "düzeltildi"),
    "correctLine": ("Correct (finalized)", "تصحيح (نهائي)", "Düzelt (kesin)"),
    "noPayroll": ("No employees were employed in this month.", "لم يكن هناك موظفون في هذا الشهر.", "Bu ay çalışan yoktu."),
    "formula": ("Pay is always on 30 days: the 31st isn't counted, February pays 30. Joining on the 10th = 21 paid days. A salary change counts from the next month.", "الدفع دائماً على 30 يوماً: يوم 31 لا يُحتسب، وشباط يُدفع 30. البدء يوم 10 = 21 يوماً مدفوعاً. تغيير الراتب يُحتسب من الشهر التالي.", "Ödeme her zaman 30 gün üzerinden: 31'i sayılmaz, Şubat 30 öder. Ayın 10'unda başlayan = 21 gün. Maaş değişikliği sonraki aydan geçerlidir."),
    "sheetsIntro": ("Choose the month, year and ONE shift, check the preview, then print. Printing marks nobody as paid.", "اختر الشهر والسنة ووردية واحدة، راجع المعاينة ثم اطبع. الطباعة لا تسجّل أحداً كمدفوع له.", "Ay, yıl ve TEK vardiya seçin, önizlemeye bakın, sonra yazdırın. Yazdırmak kimseyi ödendi saymaz."),
    "year": ("Year", "السنة", "Yıl"),
    "month": ("Month", "الشهر", "Ay"),
    "preview": ("Preview", "معاينة", "Önizle"),
    "openToPrint": ("Open to print", "فتح للطباعة", "Yazdırmak için aç"),
    "sheetFrozen": ("Payroll {state}: the frozen figures are printed.", "الرواتب {state}: تُطبع الأرقام المجمّدة.", "Bordro {state}: dondurulmuş rakamlar yazdırılır."),
    "sheetDraft": ("Draft: these figures can still change until the payroll is submitted.", "مسودة: قد تتغيّر هذه الأرقام حتى تُرسَل الرواتب.", "Taslak: bordro gönderilene kadar rakamlar değişebilir."),
    "historyIntro": ("Every month's payroll and who submitted, approved and finalized it.", "رواتب كل شهر ومن أرسلها ووافق عليها وجعلها نهائية.", "Her ayın bordrosu ve onu kimin gönderdiği, onayladığı, kesinleştirdiği."),
    "noRuns": ("No payroll submitted yet.", "لم تُرسَل أي رواتب بعد.", "Henüz bordro gönderilmedi."),
    "employeesCount": ("{n} employees", "{n} موظف", "{n} çalışan"),
    "factory": ("Factory Management System", "نظام إدارة المعمل", "Fabrika Yönetim Sistemi"),
    "sheetTitle": ("Monthly Employee Salary Sheet", "كشف رواتب الموظفين الشهري", "Aylık Çalışan Maaş Listesi"),
    "printDate": ("Printed", "تاريخ الطباعة", "Yazdırma"),
    "draftMark": ("DRAFT — not yet submitted", "مسودة — لم تُرسَل بعد", "TASLAK — henüz gönderilmedi"),
})
group("history.worker", {
    "create": ("Employee added", "إضافة موظف", "Çalışan eklendi"), "update": ("Employee details changed", "تعديل بيانات موظف", "Çalışan bilgileri değişti"),
    "salary": ("Salary changed", "تغيير راتب", "Maaş değişti"), "transfer": ("Moved to another shift", "نقل إلى وردية أخرى", "Başka vardiyaya taşındı"),
    "leader": ("Team leader changed", "تغيير قائد الوردية", "Vardiya amiri değişti"), "fired": ("Employee fired", "فصل موظف", "Çalışan çıkarıldı"), "quit": ("Employee quit", "استقالة موظف", "Çalışan ayrıldı"),
    "departureConfirm": ("Departure confirmed", "تأكيد المغادرة", "Ayrılış onaylandı"), "departureUndo": ("Departure undone", "إلغاء المغادرة", "Ayrılış geri alındı"),
})
group("history.attendance", {
    "submit": ("Attendance submitted", "إرسال الحضور", "Yoklama gönderildi"), "correct": ("Attendance corrected", "تصحيح الحضور", "Yoklama düzeltildi"),
    "excuseApprove": ("Excuse approved", "قبول عذر", "Mazeret onaylandı"), "excuseReject": ("Excuse rejected", "رفض عذر", "Mazeret reddedildi"), "excuseRevoke": ("Excuse revoked", "سحب عذر", "Mazeret geri alındı"),
    "extraAsk": ("Extra deduction days asked", "طلب أيام خصم إضافية", "Ek kesinti günü istendi"), "extraApprove": ("Extra deduction days approved", "الموافقة على أيام خصم إضافية", "Ek kesinti günü onaylandı"), "extraReject": ("Extra deduction days rejected", "رفض أيام خصم إضافية", "Ek kesinti günü reddedildi"),
})
group("history.penalty", {"add": ("Penalty given", "إعطاء غرامة", "Ceza verildi"), "change": ("Penalty changed", "تعديل غرامة", "Ceza değişti"), "cancel": ("Penalty cancelled", "إلغاء غرامة", "Ceza iptal edildi")})
group("history.blacklist", {"add": ("Added to blacklist", "إضافة إلى القائمة السوداء", "Kara listeye eklendi"), "removeAsk": ("Blacklist removal asked", "طلب إزالة من القائمة السوداء", "Kara listeden çıkarma istendi"), "remove": ("Removed from blacklist", "إزالة من القائمة السوداء", "Kara listeden çıkarıldı"), "removeRefused": ("Blacklist removal refused", "رفض الإزالة من القائمة السوداء", "Kara listeden çıkarma reddedildi")})
group("history.payroll", {"submit": ("Payroll submitted", "إرسال الرواتب", "Bordro gönderildi"), "approve": ("Payroll approved", "الموافقة على الرواتب", "Bordro onaylandı"), "reject": ("Payroll sent back", "إعادة الرواتب", "Bordro geri gönderildi"), "finalize": ("Payroll finalized", "الرواتب نهائية", "Bordro kesinleşti"), "correct": ("Finalized payroll corrected", "تصحيح رواتب نهائية", "Kesin bordro düzeltildi"), "print": ("Salary sheet printed", "طباعة كشف الرواتب", "Maaş listesi yazdırıldı")})
group("audit.entity", {"Worker": ("Employee", "موظف", "Çalışan"), "AttendanceReport": ("Attendance report", "تقرير حضور", "Yoklama raporu"), "AttendanceRecord": ("Attendance", "حضور", "Yoklama"), "Penalty": ("Penalty", "غرامة", "Ceza"), "BlacklistEntry": ("Blacklist", "القائمة السوداء", "Kara liste"), "PayrollRun": ("Payroll", "الرواتب", "Bordro"), "Shift": ("Shift", "وردية", "Vardiya")})
def nt(key, title, body):
    add(f"nt.{key}.title", *title); add(f"nt.{key}.body", *body)
nt("worker.leader", ("You lead shift {shift}", "أنت قائد الوردية {shift}", "{shift}. vardiyanın amirisiniz"), ("set by {by}", "عيّنك {by}", "atayan: {by}"))
nt("worker.departure", ("{name} left ({kind}) — shift {shift}", "{name} غادر ({kind}) — الوردية {shift}", "{name} ayrıldı ({kind}) — vardiya {shift}"), ("recorded by {by}; confirm it", "سجّله {by}؛ أكّده", "kaydeden {by}; onaylayın"))
nt("blacklist.added", ("{name} added to the blacklist", "أُضيف {name} إلى القائمة السوداء", "{name} kara listeye eklendi"), ("shift {shift} · by {by}", "الوردية {shift} · بواسطة {by}", "vardiya {shift} · {by}"))
nt("blacklist.removeAsk", ("Remove {name} from the blacklist?", "إزالة {name} من القائمة السوداء؟", "{name} kara listeden çıkarılsın mı?"), ("asked by {by}", "طلبه {by}", "isteyen {by}"))
nt("attendance.excuses", ("{n} excused absence(s) to approve", "{n} غياب بعذر بانتظار الموافقة", "Onaylanacak {n} mazeretli devamsızlık"), ("shift {shift}, {day} · by {by}", "الوردية {shift}، {day} · بواسطة {by}", "vardiya {shift}, {day} · {by}"))
nt("attendance.extra", ("Extra deduction: {name} +{days} day(s)", "خصم إضافي: {name} +{days} يوم", "Ek kesinti: {name} +{days} gün"), ("absence on {day} · asked by {by}", "غياب يوم {day} · طلبه {by}", "{day} devamsızlığı · isteyen {by}"))
nt("payroll.submitted", ("Payroll {month} waiting for approval", "رواتب {month} بانتظار الموافقة", "{month} bordrosu onay bekliyor"), ("{n} employees · by {by}", "{n} موظف · بواسطة {by}", "{n} çalışan · {by}"))
nt("payroll.approved", ("Payroll {month} approved", "تمت الموافقة على رواتب {month}", "{month} bordrosu onaylandı"), ("by {by}", "بواسطة {by}", "{by}"))
nt("payroll.rejected", ("Payroll {month} sent back", "أُعيدت رواتب {month}", "{month} bordrosu geri gönderildi"), ("{by}: {note}", "{by}: {note}", "{by}: {note}"))

for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
