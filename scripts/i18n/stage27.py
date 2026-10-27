"""Suppliers merged into customers (owner, 27 Oct 2026): one account list, bought from and sold to."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("cust", {
    "intro": ("Customer accounts — the factory sells to them and buys from them. A sale or money paid to them lowers the balance; a purchase from them or money received raises it. − = they owe the factory, + = the factory owes them.",
              "حسابات الزبائن — المعمل يبيع لهم ويشتري منهم. البيع أو المال المدفوع لهم يُنقص الرصيد؛ الشراء منهم أو المال المستلم يزيده. − = مدين للمعمل، + = المعمل مدين له.",
              "Müşteri hesapları — fabrika onlara satar ve onlardan alır. Satış veya onlara ödenen para bakiyeyi düşürür; onlardan alış veya alınan para artırır. − = fabrikaya borçlu, + = fabrika ona borçlu."),
    "signHint": ("− = the customer owes the factory · + = the factory owes them", "− يعني أن الزبون مدين للمعمل · + المعمل مدين له", "− = müşteri fabrikaya borçlu · + = fabrika ona borçlu"),
    "totalWeOwe": ("The factory owes ({cur})", "المعمل مدين ({cur})", "Fabrikanın borcu ({cur})"),
    "weOweFilter": ("The factory owes them", "المعمل مدين لهم", "Fabrika onlara borçlu"),
    "salesN": ("{n} sales and purchases", "{n} مبيعات ومشتريات", "{n} satış ve alış"),
    "newPurchase": ("New purchase", "شراء جديد", "Yeni alış"),
    "pay": ("Pay the customer", "الدفع للزبون", "Müşteriye öde"),
    "payHint": ("Money paid to this customer (e.g. for what was bought from them) leaves the chosen safe and lowers the balance.", "المال المدفوع لهذا الزبون (مثلاً عما اشتُري منه) يخرج من الخزنة المختارة ويُنقص الرصيد.", "Bu müşteriye ödenen para (ör. ondan alınanlar için) seçilen kasadan çıkar ve bakiyeyi düşürür."),
    "payCurrency": ("Currency paid", "عملة الدفع", "Ödeme para birimi"),
    "payAmount": ("Amount paid", "المبلغ المدفوع", "Ödenen tutar"),
    "payNote": ("Note on the money paid", "ملاحظة على المال المدفوع", "Ödenen para notu"),
    "paySave": ("Save money paid", "حفظ المال المدفوع", "Ödenen parayı kaydet"),
    "paid": ("{number} saved. The money left the safe.", "حُفظ {number}. خرج المال من الخزنة.", "{number} kaydedildi. Para kasadan çıktı."),
})
group("cust.kind", {"sale": ("Sale", "بيع", "Satış"), "purchase": ("Purchase", "شراء", "Alış"), "payment": ("Money received", "مال مستلم", "Alınan para"), "paid": ("Paid to them", "مدفوع له", "Ona ödenen")})
add("sd.help.BUY", "Items bought from a customer account, with the price in IQD, USD or EUR. A discount only lowers what is owed to them.", "مواد مشتراة من حساب زبون بالسعر بالدينار أو الدولار أو اليورو. الخصم يُنقص فقط ما يُدين به المعمل له.", "Bir müşteri hesabından IQD, USD veya EUR fiyatla alınan malzemeler. İndirim yalnızca ona olan borcu düşürür.")
add("sd.buyRateHint", "Typed by you. The customer's balance is in {cur}; the IQD value is for the records.", "تكتبه أنت. رصيد الزبون بـ {cur}؛ القيمة بالدينار للسجلات.", "Sizin yazdığınız. Müşteri bakiyesi {cur} cinsinden; IQD değeri kayıt içindir.")
add("sd.supplierRef", "Their invoice no.", "رقم فاتورتهم", "Onların fatura no")
add("cash.weOwe", "The factory owes", "المعمل مدين", "Fabrikanın borcu")
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    # supplier screens are gone
    for k in ["supp"]: d.pop(k, None)
    for grp, k in [("nav", "suppliers"), ("search", None)]:
        if k: d.get(grp, {}).pop(k, None)
    d.get("perm", {}).get("resources", {}).pop("suppliers", None)
    d.get("search", {}).get("kind", {}).pop("suppliers", None)
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
