"""Customer accounts, sale discounts, delivery place, automatic invoice numbers, receipt balances."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("nav", {"customers": ("Customers", "الزبائن", "Müşteriler")})
group("perm.resources", {"customers": ("Customers (accounts)", "الزبائن (الحسابات)", "Müşteriler (hesaplar)")})
group("search.kind", {"customers": ("Customers", "الزبائن", "Müşteriler")})
group("sd", {
    "delivery": ("Delivery place", "مكان التسليم", "Teslim yeri"),
    "invoiceAuto": ("The invoice number is given automatically.", "رقم الفاتورة يُعطى تلقائياً.", "Fatura numarası otomatik verilir."),
    "discount": ("Discount", "الخصم", "İndirim"),
    "discountKind": ("discount type", "نوع الخصم", "indirim türü"),
    "subtotal": ("Subtotal", "المجموع قبل الخصم", "Ara toplam"),
    "invoiceDiscount": ("Discount on the whole invoice", "خصم على الفاتورة كلها", "Faturanın tamamına indirim"),
    "invoiceDiscountKind": ("Invoice discount type", "نوع خصم الفاتورة", "Fatura indirimi türü"),
})
group("cust", {
    "intro": ("Customer accounts: each sale lowers the balance (the customer owes, shown with −), each payment raises it.", "حسابات الزبائن: كل بيع يُنقص الرصيد (الزبون مدين ويظهر بـ −)، وكل دفعة تزيده.", "Müşteri hesapları: her satış bakiyeyi düşürür (müşteri borçlu, − ile gösterilir), her ödeme artırır."),
    "choose": ("Choose the customer…", "اختر الزبون…", "Müşteriyi seçin…"),
    "new": ("New customer", "زبون جديد", "Yeni müşteri"),
    "add": ("Add customer", "إضافة الزبون", "Müşteriyi ekle"),
    "name": ("Customer name", "اسم الزبون", "Müşteri adı"),
    "newPhone": ("New customer's phone", "هاتف الزبون الجديد", "Yeni müşterinin telefonu"),
    "address": ("Address", "العنوان", "Adres"),
    "code": ("Customer code", "رمز الزبون", "Müşteri kodu"),
    "codeAuto": ("Code (empty = automatic C-0001)", "الرمز (فارغ = تلقائي C-0001)", "Kod (boş = otomatik C-0001)"),
    "balanceNow": ("Balance now", "الرصيد الحالي", "Şu anki bakiye"),
    "prevBalance": ("Balance before", "الرصيد السابق", "Önceki bakiye"),
    "newBalance": ("Balance after", "الرصيد بعد", "Sonraki bakiye"),
    "signHint": ("− = the customer owes the factory", "− يعني أن الزبون مدين للمعمل", "− = müşteri fabrikaya borçlu"),
    "totalOwed": ("Customers owe us ({cur})", "ديون الزبائن لنا ({cur})", "Müşterilerin borcu ({cur})"),
    "search": ("Code, name, phone or address…", "الرمز، الاسم، الهاتف أو العنوان…", "Kod, ad, telefon veya adres…"),
    "all": ("All customers", "كل الزبائن", "Tüm müşteriler"),
    "owing": ("Owe us money", "مدينون لنا", "Bize borçlu"),
    "none": ("No customers yet.", "لا زبائن بعد.", "Henüz müşteri yok."),
    "salesN": ("{n} sales", "{n} مبيعات", "{n} satış"),
    "newSale": ("New sale", "بيع جديد", "Yeni satış"),
    "saved": ("Customer saved.", "تم حفظ الزبون.", "Müşteri kaydedildi."),
    "balance": ("Balance ({cur})", "الرصيد ({cur})", "Bakiye ({cur})"),
    "owesUs": ("The customer owes the factory", "الزبون مدين للمعمل", "Müşteri fabrikaya borçlu"),
    "weOwe": ("The factory owes the customer", "المعمل مدين للزبون", "Fabrika müşteriye borçlu"),
    "settled": ("Nothing owed", "لا ديون", "Borç yok"),
    "statement": ("Account statement", "كشف الحساب", "Hesap ekstresi"),
    "noMoves": ("No sales or payments yet.", "لا مبيعات أو دفعات بعد.", "Henüz satış veya ödeme yok."),
    "when": ("When", "متى", "Ne zaman"),
    "what": ("Document", "المستند", "Belge"),
    "amount": ("Amount", "المبلغ", "Tutar"),
    "runBalance": ("Balance", "الرصيد", "Bakiye"),
    "receive": ("Receive payment", "استلام دفعة", "Tahsilat al"),
    "receiveHint": ("Money from this customer goes into the safe and raises the balance. More than owed is allowed — the factory then owes the customer (+).", "المال من هذا الزبون يدخل الخزنة ويرفع الرصيد. يُسمح بأكثر من الدين — عندها المعمل مدين للزبون (+).", "Bu müşteriden gelen para kasaya girer ve bakiyeyi artırır. Borçtan fazlası olabilir — o zaman fabrika müşteriye borçlu olur (+)."),
    "receiveAmount": ("Amount received", "المبلغ المستلم", "Alınan tutar"),
    "receiveNote": ("Payment note", "ملاحظة الدفعة", "Ödeme notu"),
    "receiveSave": ("Save payment", "حفظ الدفعة", "Ödemeyi kaydet"),
    "received": ("{number} saved. The money is in the safe.", "حُفظ {number}. المال في الخزنة.", "{number} kaydedildi. Para kasada."),
    "edit": ("Edit customer", "تعديل الزبون", "Müşteriyi düzenle"),
})
group("cust.kind", {"sale": ("Sale", "بيع", "Satış"), "payment": ("Payment", "دفعة", "Ödeme")})
group("rc2.f", {"customerCode": ("Customer code", "رمز الزبون", "Müşteri kodu"), "delivery": ("Delivery place", "مكان التسليم", "Teslim yeri"), "balance": ("Customer balance (before / after)", "رصيد الزبون (قبل / بعد)", "Müşteri bakiyesi (önce / sonra)")})
group("rc2.c", {"discount": ("Discount", "الخصم", "İndirim")})
group("rep.col", {"discount": ("Discount", "الخصم", "İndirim")})
group("history.customer", {"create": ("Customer added", "إضافة زبون", "Müşteri eklendi"), "update": ("Customer changed", "تعديل زبون", "Müşteri değiştirildi"), "archive": ("Customer archived", "أرشفة زبون", "Müşteri arşivlendi"), "restore": ("Customer restored", "استعادة زبون", "Müşteri geri alındı")})
group("audit.entity", {"Customer": ("Customer", "زبون", "Müşteri")})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
