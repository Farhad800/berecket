"""Supplier accounts, purchase number / supplier's invoice, rate on purchases, purchase discounts, paid starts at 0."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("nav", {"suppliers": ("Suppliers", "الموردون", "Tedarikçiler")})
group("perm.resources", {"suppliers": ("Suppliers (accounts)", "الموردون (الحسابات)", "Tedarikçiler (hesaplar)")})
group("search.kind", {"suppliers": ("Suppliers", "الموردون", "Tedarikçiler")})
group("audit.entity", {"Supplier": ("Supplier", "مورد", "Tedarikçi")})
group("history.supplier", {"create": ("Supplier added", "إضافة مورد", "Tedarikçi eklendi"), "update": ("Supplier changed", "تعديل مورد", "Tedarikçi değiştirildi"), "archive": ("Supplier archived", "أرشفة مورد", "Tedarikçi arşivlendi"), "restore": ("Supplier restored", "استعادة مورد", "Tedarikçi geri alındı")})
group("supp", {
    "intro": ("Supplier accounts: each purchase lowers the balance (the factory owes the supplier, shown with −), each payment to the supplier raises it.", "حسابات الموردين: كل شراء يُنقص الرصيد (المعمل مدين للمورد ويظهر بـ −)، وكل دفعة للمورد تزيده.", "Tedarikçi hesapları: her alış bakiyeyi düşürür (fabrika tedarikçiye borçlu, − ile gösterilir), tedarikçiye her ödeme artırır."),
    "choose": ("Choose the supplier…", "اختر المورد…", "Tedarikçiyi seçin…"),
    "new": ("New supplier", "مورد جديد", "Yeni tedarikçi"),
    "add": ("Add supplier", "إضافة المورد", "Tedarikçiyi ekle"),
    "name": ("Supplier name", "اسم المورد", "Tedarikçi adı"),
    "newPhone": ("New supplier's phone", "هاتف المورد الجديد", "Yeni tedarikçinin telefonu"),
    "address": ("Address", "العنوان", "Adres"),
    "code": ("Supplier code", "رمز المورد", "Tedarikçi kodu"),
    "codeAuto": ("Code (empty = automatic S-0001)", "الرمز (فارغ = تلقائي S-0001)", "Kod (boş = otomatik S-0001)"),
    "totalOwed": ("We owe suppliers ({cur})", "ديوننا للموردين ({cur})", "Tedarikçilere borcumuz ({cur})"),
    "search": ("Code, name, phone or address…", "الرمز، الاسم، الهاتف أو العنوان…", "Kod, ad, telefon veya adres…"),
    "all": ("All suppliers", "كل الموردين", "Tüm tedarikçiler"),
    "owing": ("We owe them", "نحن مدينون لهم", "Borçlu olduklarımız"),
    "none": ("No suppliers yet.", "لا موردين بعد.", "Henüz tedarikçi yok."),
    "salesN": ("{n} purchases", "{n} مشتريات", "{n} alış"),
    "newSale": ("New purchase", "شراء جديد", "Yeni alış"),
    "saved": ("Supplier saved.", "تم حفظ المورد.", "Tedarikçi kaydedildi."),
    "balance": ("Balance ({cur})", "الرصيد ({cur})", "Bakiye ({cur})"),
    "owesUs": ("The factory owes the supplier", "المعمل مدين للمورد", "Fabrika tedarikçiye borçlu"),
    "weOwe": ("Paid in advance", "مدفوع مقدماً", "Peşin ödendi"),
    "settled": ("Nothing owed", "لا ديون", "Borç yok"),
    "statement": ("Account statement", "كشف الحساب", "Hesap ekstresi"),
    "noMoves": ("No purchases or payments yet.", "لا مشتريات أو دفعات بعد.", "Henüz alış veya ödeme yok."),
    "when": ("When", "متى", "Ne zaman"), "what": ("Document", "المستند", "Belge"), "amount": ("Amount", "المبلغ", "Tutar"), "runBalance": ("Balance", "الرصيد", "Bakiye"),
    "pay": ("Pay the supplier", "الدفع للمورد", "Tedarikçiye öde"),
    "payHint": ("Money paid to this supplier leaves the chosen safe and raises the balance. More than owed is allowed — that is money paid in advance (+).", "المال المدفوع لهذا المورد يخرج من الخزنة المختارة ويرفع الرصيد. يُسمح بأكثر من الدين — يكون دفعاً مقدماً (+).", "Bu tedarikçiye ödenen para seçilen kasadan çıkar ve bakiyeyi artırır. Borçtan fazlası olabilir — bu peşin ödemedir (+)."),
    "payAmount": ("Amount paid", "المبلغ المدفوع", "Ödenen tutar"),
    "payNote": ("Payment note", "ملاحظة الدفعة", "Ödeme notu"),
    "paySave": ("Save payment", "حفظ الدفعة", "Ödemeyi kaydet"),
    "paid": ("{number} saved. The money left the safe.", "حُفظ {number}. خرج المال من الخزنة.", "{number} kaydedildi. Para kasadan çıktı."),
    "signHint": ("− = the factory owes the supplier", "− يعني أن المعمل مدين للمورد", "− = fabrika tedarikçiye borçlu"),
    "edit": ("Edit supplier", "تعديل المورد", "Tedarikçiyi düzenle"),
})
group("supp.kind", {"sale": ("Purchase", "شراء", "Alış"), "payment": ("Payment", "دفعة", "Ödeme")})
group("sd", {
    "supplierRef": ("Supplier's invoice no.", "رقم فاتورة المورد", "Tedarikçi fatura no"),
    "purchaseAuto": ("Our purchase number (PUR-…) is given automatically.", "رقم الشراء لدينا (PUR-…) يُعطى تلقائياً.", "Alış numaramız (PUR-…) otomatik verilir."),
    "purchaseNo": ("Purchase no.", "رقم الشراء", "Alış no"),
    "buyRate": ("Rate of the day", "سعر الصرف اليوم", "Günün kuru"),
    "buyRateHint": ("Typed by you. The supplier is owed in {cur}; the IQD value is for the records.", "تكتبه أنت. دين المورد بـ {cur}؛ القيمة بالدينار للسجلات.", "Sizin yazdığınız. Tedarikçiye {cur} borçlanılır; IQD değeri kayıt içindir."),
    "iqdValue": ("Value in IQD", "القيمة بالدينار", "IQD değeri"),
})
add("sd.help.BUY", "Items bought from a supplier account, with the price in IQD, USD or EUR. A discount only lowers what is owed to the supplier.", "مواد مشتراة من حساب مورد مع السعر بالدينار أو الدولار أو اليورو. الخصم يُنقص فقط ما نحن مدينون به للمورد.", "Bir tedarikçi hesabından alınan kalemler, IQD, USD veya EUR fiyatla. İndirim yalnızca tedarikçiye olan borcu düşürür.")
add("cash.paidHint", "Taken from the safe. Starts at 0 — type what was really paid, or press Paid in full.", "يُؤخذ من الخزنة. يبدأ من 0 — اكتب ما دُفع فعلاً أو اضغط مدفوع بالكامل.", "Kasadan alınır. 0'dan başlar — gerçekten ödeneni yazın veya Tamamı ödendi'ye basın.")
add("cash.receivedHint", "Goes into the safe. Starts at 0 — type what was really received, or press Paid in full.", "يدخل الخزنة. يبدأ من 0 — اكتب ما استُلم فعلاً أو اضغط مدفوع بالكامل.", "Kasaya girer. 0'dan başlar — gerçekten alınanı yazın veya Tamamı ödendi'ye basın.")
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
