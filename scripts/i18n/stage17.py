"""The safe (cash box): money in / out / exchange, payments for Buy & Sell, expense categories, EUR."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("nav", {"cash": ("Safe", "الخزنة", "Kasa")})
group("perm.resources", {"cash": ("Safe (money)", "الخزنة (المال)", "Kasa (para)")})
group("perm.actions", {"in": ("Money in", "إيداع", "Para girişi"), "out": ("Money out", "صرف", "Para çıkışı"), "exchange": ("Exchange", "صرافة", "Döviz çevir")})
group("sd", {"eur": ("Euro", "يورو", "Euro")})
group("cash", {
    "intro": ("Money in the safe per currency. Sales and money put in add to it; purchases and expenses take from it.", "المال في الخزنة لكل عملة. المبيعات والإيداعات تزيدها، والمشتريات والمصاريف تُنقصها.", "Para birimine göre kasadaki para. Satışlar ve yatırılan para artırır; alışlar ve giderler azaltır."),
    "search": ("Number, name, note or document…", "الرقم، الاسم، الملاحظة أو المستند…", "Numara, ad, not veya belge…"),
    "allKinds": ("All kinds", "كل الأنواع", "Tüm türler"),
    "allCurrencies": ("All currencies", "كل العملات", "Tüm para birimleri"),
    "none": ("No money movements yet.", "لا حركات مالية بعد.", "Henüz para hareketi yok."),
    "newTitle": ("Safe: new entry", "الخزنة: قيد جديد", "Kasa: yeni kayıt"),
    "currency": ("Currency", "العملة", "Para birimi"),
    "amount": ("Amount", "المبلغ", "Tutar"),
    "inSafe": ("In the safe", "في الخزنة", "Kasada"),
    "notEnough": ("More than the safe has", "أكثر مما في الخزنة", "Kasadakinden fazla"),
    "category": ("Spent on", "صُرف على", "Harcama türü"),
    "from": ("From", "من", "Kimden"),
    "paidTo": ("Paid to", "دُفع إلى", "Kime ödendi"),
    "give": ("Currency you give", "العملة المُعطاة", "Verilen para birimi"),
    "receiveCur": ("Currency you receive", "العملة المُستلمة", "Alınan para birimi"),
    "rate": ("Rate: 1 {from} = ? {to}", "السعر: 1 {from} = ? {to}", "Kur: 1 {from} = ? {to}"),
    "rateLabel": ("Exchange rate", "سعر الصرف", "Döviz kuru"),
    "youGet": ("You receive", "تستلم", "Alacağınız"),
    "saved": ("{number} saved. The safe has been updated.", "حُفظ {number}. تم تحديث الخزنة.", "{number} kaydedildi. Kasa güncellendi."),
    "moneyIn": ("Money in", "مال داخل", "Giren para"),
    "moneyOut": ("Money out", "مال خارج", "Çıkan para"),
    "forDoc": ("For document", "للمستند", "Belge"),
    "paidNow": ("Paid now", "المدفوع الآن", "Şimdi ödenen"),
    "receivedNow": ("Received now", "المستلم الآن", "Şimdi alınan"),
    "paidHint": ("Taken from the safe. Leave the rest to pay later.", "يُؤخذ من الخزنة. اترك الباقي للدفع لاحقاً.", "Kasadan alınır. Kalanı sonra ödeyin."),
    "receivedHint": ("Goes into the safe. The rest stays as owed by the customer.", "يدخل الخزنة. الباقي يبقى ديناً على الزبون.", "Kasaya girer. Kalanı müşterinin borcu olarak kalır."),
    "stillOwed": ("Still owed", "المتبقي (دين)", "Kalan borç"),
    "payAll": ("Paid in full", "دفع كامل", "Tamamı ödendi"),
    "paidTitle": ("Payment to the supplier", "الدفع للمورد", "Tedarikçiye ödeme"),
    "receivedTitle": ("Payment from the customer", "الدفع من الزبون", "Müşteriden tahsilat"),
    "paid": ("Paid", "المدفوع", "Ödenen"),
    "received": ("Received", "المستلم", "Alınan"),
    "pay": ("Pay", "دفع", "Öde"),
    "receive": ("Receive payment", "استلام دفعة", "Tahsil et"),
    "convertTitle": ("Total value of the safe", "القيمة الكلية للخزنة", "Kasanın toplam değeri"),
    "convertHint": ("Only a calculation at the rates you type — the money in the safe is not changed. To really change money use Exchange.", "حساب فقط بالأسعار التي تكتبها — المال في الخزنة لا يتغير. لتحويل المال فعلاً استخدم الصرافة.", "Yalnızca yazdığınız kurlarla bir hesap — kasadaki para değişmez. Gerçekten çevirmek için Döviz çevir'i kullanın."),
    "showIn": ("Show in", "اعرض بـ", "Göster"),
    "totalValue": ("Total", "المجموع", "Toplam"),
    "owedToUs": ("Customers owe us", "ديون الزبائن لنا", "Müşterilerin borcu"),
    "weOwe": ("We owe suppliers", "ديوننا للموردين", "Tedarikçilere borcumuz"),
    "nothingOwed": ("Nothing owed.", "لا ديون.", "Borç yok."),
    "newCategory": ("New category name", "اسم فئة جديدة", "Yeni kategori adı"),
    "addCategory": ("Add", "إضافة", "Ekle"),
    "usedN": ("used {n} times", "استُخدمت {n} مرة", "{n} kez kullanıldı"),
    "hide": ("Hide", "إخفاء", "Gizle"),
    "restore": ("Show again", "إظهار", "Tekrar göster"),
})
group("cash.cur", {"IQD": ("Iraqi dinar", "دينار عراقي", "Irak dinarı"), "USD": ("US dollar", "دولار أمريكي", "ABD doları"), "EUR": ("Euro", "يورو", "Euro")})
group("cash.tab", {"movements": ("Movements", "الحركات", "Hareketler"), "owed": ("Still owed", "الديون", "Borçlar"), "categories": ("Expense categories", "فئات المصاريف", "Gider kategorileri")})
group("cash.kind", {"DEPOSIT": ("Money in", "إيداع", "Para girişi"), "EXPENSE": ("Expense", "مصروف", "Gider"), "SALE": ("Sale payment", "دفعة بيع", "Satış tahsilatı"), "PURCHASE": ("Purchase payment", "دفعة شراء", "Alış ödemesi"), "EXCHANGE": ("Exchange", "صرافة", "Döviz çevirme")})
group("cash.new", {"IN": ("Money in", "إيداع", "Para girişi"), "OUT": ("Money out", "صرف", "Para çıkışı"), "EXCHANGE": ("Exchange", "صرافة", "Döviz çevir")})
group("cash.save", {"IN": ("Save money in", "حفظ الإيداع", "Girişi kaydet"), "OUT": ("Save expense", "حفظ المصروف", "Gideri kaydet"), "EXCHANGE": ("Save exchange", "حفظ الصرافة", "Çevirmeyi kaydet")})
group("cash.help", {
    "IN": ("Money put into the safe by hand (not from a sale), e.g. from the owner or a bank.", "مال يوضع في الخزنة يدوياً (ليس من بيع)، مثلاً من المالك أو البنك.", "Kasaya elle konan para (satıştan değil), ör. sahibinden veya bankadan."),
    "OUT": ("An expense paid from the safe: salaries, electricity, fuel… You can't take out more than the safe holds.", "مصروف يُدفع من الخزنة: رواتب، كهرباء، وقود… لا يمكن صرف أكثر مما في الخزنة.", "Kasadan ödenen gider: maaş, elektrik, yakıt… Kasadakinden fazla çıkarılamaz."),
    "EXCHANGE": ("Change money from one currency into another at the rate you got.", "تحويل مال من عملة إلى أخرى بالسعر الذي حصلت عليه.", "Parayı aldığınız kurla bir para biriminden diğerine çevirin."),
})
group("cash.cat", {"SALARIES": ("Salaries", "رواتب", "Maaşlar"), "ELECTRICITY": ("Electricity", "كهرباء", "Elektrik"), "FUEL": ("Fuel / generator", "وقود / مولدة", "Yakıt / jeneratör"), "RENT": ("Rent", "إيجار", "Kira"), "MAINTENANCE": ("Maintenance & spare parts", "صيانة وقطع غيار", "Bakım ve yedek parça"), "TRANSPORT": ("Transport", "نقل", "Nakliye"), "FOOD": ("Food", "طعام", "Yemek"), "OTHER": ("Other", "أخرى", "Diğer")})
group("search.kind", {"cashEntries": ("Safe", "الخزنة", "Kasa")})
group("rep.sec", {"money": ("Money", "المال", "Para")})
group("rep.r.cash", {"title": ("Safe: money in and out", "الخزنة: الداخل والخارج", "Kasa: giren ve çıkan"), "desc": ("Every movement of money with category, person and totals per currency.", "كل حركة مال مع الفئة والشخص والمجاميع لكل عملة.", "Kategori, kişi ve para birimine göre toplamlarla her para hareketi.")})
group("rep.col", {"expenseCat": ("Spent on", "صُرف على", "Harcama türü"), "forDoc": ("For document", "للمستند", "Belge"), "note": ("Note", "ملاحظة", "Not"), "moneyIn": ("In", "داخل", "Giren"), "moneyOut": ("Out", "خارج", "Çıkan")})
kp = {}
for c, ar in [("Iqd", "دينار"), ("Usd", "دولار"), ("Eur", "يورو")]:
    C = c.upper()
    kp[f"in{c}"] = (f"In ({C})", f"الداخل ({ar})", f"Giren ({C})")
    kp[f"out{c}"] = (f"Out ({C})", f"الخارج ({ar})", f"Çıkan ({C})")
kp["boughtEur"] = ("Bought (EUR)", "المشتريات (يورو)", "Alış (EUR)")
kp["soldEur"] = ("Sold (EUR)", "المبيعات (يورو)", "Satış (EUR)")
group("rep.kpi", kp)
group("history.cash", {"in": ("Money put in the safe", "إيداع في الخزنة", "Kasaya para girişi"), "out": ("Expense paid from the safe", "مصروف من الخزنة", "Kasadan gider"), "exchange": ("Currency exchanged", "صرف عملة", "Döviz çevrildi"), "receive": ("Payment received", "استلام دفعة", "Tahsilat"), "pay": ("Payment made", "دفع دفعة", "Ödeme"), "categoryAdd": ("Expense category added", "إضافة فئة مصروف", "Gider kategorisi eklendi"), "categoryHide": ("Expense category hidden", "إخفاء فئة مصروف", "Gider kategorisi gizlendi"), "categoryRestore": ("Expense category shown again", "إظهار فئة مصروف", "Gider kategorisi tekrar gösterildi")})
group("audit.entity", {"CashEntry": ("Safe entry", "قيد خزنة", "Kasa kaydı"), "ExpenseCategory": ("Expense category", "فئة مصروف", "Gider kategorisi")})
def nt(t, title, body):
    add(f"nt.{t}.title", *title); add(f"nt.{t}.body", *body)
nt("cash.in", ("Money in {number}: {amount}", "إيداع {number}: {amount}", "Para girişi {number}: {amount}"), ("{what} · by {by}", "{what} · بواسطة {by}", "{what} · {by}"))
nt("cash.out", ("Expense {number}: {amount}", "مصروف {number}: {amount}", "Gider {number}: {amount}"), ("{what} · by {by}", "{what} · بواسطة {by}", "{what} · {by}"))
nt("cash.exchange", ("Exchange {number}: {gave} → {got}", "صرافة {number}: {gave} ← {got}", "Döviz {number}: {gave} → {got}"), ("by {by}", "بواسطة {by}", "{by}"))
nt("cash.receive", ("Received {amount} for {doc}", "استُلم {amount} عن {doc}", "{doc} için {amount} tahsil edildi"), ("from {party} · by {by}", "من {party} · بواسطة {by}", "{party} · {by}"))
nt("cash.pay", ("Paid {amount} for {doc}", "دُفع {amount} عن {doc}", "{doc} için {amount} ödendi"), ("to {party} · by {by}", "إلى {party} · بواسطة {by}", "{party} · {by}"))
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
