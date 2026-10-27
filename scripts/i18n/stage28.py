"""Edit products/items in the same boxes as when added; edit receipts and money entries in place (owner, 27 Oct 2026)."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("item", {
    "edit": ("Edit item", "تعديل المادة", "Malzemeyi düzenle"),
    "unitLocked": ("Stock already moved in or out, so the unit can't change.", "تحرك المخزون بالفعل، لذا لا يمكن تغيير الوحدة.", "Stok zaten hareket etti, birim değiştirilemez."),
})
group("sd", {
    "edit": ("Edit", "تعديل", "Düzenle"),
    "editTitle": ("Edit {number}", "تعديل {number}", "{number} düzenle"),
    "editing": ("You are changing {number}. It keeps its number; stock, the customer's balance and batches follow the new values.", "أنت تعدّل {number}. يبقى رقمه كما هو؛ المخزون ورصيد الزبون والدفعات تتبع القيم الجديدة.", "{number} belgesini değiştiriyorsunuz. Numarası aynı kalır; stok, müşteri bakiyesi ve partiler yeni değerleri izler."),
    "editReason": ("Why is it changed?", "سبب التعديل", "Neden değiştiriliyor?"),
    "editPaidHint": ("Money already paid stays as it is; change a payment on its own page.", "المال المدفوع يبقى كما هو؛ عدّل الدفعة من صفحتها.", "Ödenmiş para olduğu gibi kalır; bir ödemeyi kendi sayfasından değiştirin."),
    "saveChanges": ("Save changes", "حفظ التعديلات", "Değişiklikleri kaydet"),
})
group("cash", {
    "edit": ("Edit entry", "تعديل القيد", "Kaydı düzenle"),
    "editAmount": ("New amount", "المبلغ الجديد", "Yeni tutar"),
    "editSafe": ("Safe", "الخزنة", "Kasa"),
    "editNote": ("Note on the entry", "ملاحظة القيد", "Kayıt notu"),
    "editFrom": ("Given ({cur})", "المُعطى ({cur})", "Verilen ({cur})"),
    "editTo": ("Received ({cur})", "المستلم ({cur})", "Alınan ({cur})"),
})
add("history.stock.edit", "Receipt changed", "تعديل وصل", "Fiş değiştirildi")
add("history.cash.edit", "Money entry changed", "تعديل قيد مالي", "Para kaydı değiştirildi")
add("nt.stock.edited.title", "{number} was changed", "تم تعديل {number}", "{number} değiştirildi")
add("nt.stock.edited.body", "by {by}: {reason}", "بواسطة {by}: {reason}", "{by}: {reason}")
add("nt.cash.edited.title", "{number} was changed", "تم تعديل {number}", "{number} değiştirildi")
add("nt.cash.edited.body", "by {by}: {reason}", "بواسطة {by}: {reason}", "{by}: {reason}")
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
