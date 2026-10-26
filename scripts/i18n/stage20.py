"""Several safes, transfers between safes, exchange with three boxes (from / to / rate)."""
import json
S = {}
def add(path, en, ar, tr): S[path] = (en, ar, tr)
def group(prefix, d):
    for k, v in d.items(): add(f"{prefix}.{k}", *v)
group("safe", {
    "safe": ("Safe", "القاصة", "Kasa"),
    "noneHolds": ("No safe holds {currency}", "لا توجد قاصة فيها {currency}", "{currency} tutan kasa yok"),
    "calculated": ("Calculated from the other two boxes — type here to change it", "محسوب من الخانتين الأخريين — اكتب هنا لتغييره", "Diğer iki kutudan hesaplandı — değiştirmek için buraya yazın"),
    "exFrom": ("From", "من", "Nereden"),
    "exTo": ("To", "إلى", "Nereye"),
    "fromSafe": ("From safe", "من القاصة", "Çıkan kasa"),
    "toSafe": ("To safe", "إلى القاصة", "Giren kasa"),
    "exFromAmount": ("Amount you give", "المبلغ المدفوع", "Verilen tutar"),
    "exToAmount": ("Amount you receive", "المبلغ المستلم", "Alınan tutar"),
    "new": ("New safe", "قاصة جديدة", "Yeni kasa"),
    "edit": ("Edit", "تعديل", "Düzenle"),
    "delete": ("Delete", "حذف", "Sil"),
    "name": ("Safe name", "اسم القاصة", "Kasa adı"),
    "holds": ("Currencies it holds", "العملات التي تحفظها", "Tuttuğu para birimleri"),
    "save": ("Save safe", "حفظ القاصة", "Kasayı kaydet"),
    "main": ("Main", "الرئيسية", "Ana"),
    "manageHint": ("Each safe has its own name and the currencies it holds. A currency can be removed only when that safe has none of it; a safe can be deleted only if it was never used.", "لكل قاصة اسمها والعملات التي تحفظها. لا يمكن إزالة عملة إلا إذا كانت القاصة فارغة منها، ولا يمكن حذف قاصة إلا إذا لم تُستعمل أبداً.", "Her kasanın kendi adı ve tuttuğu para birimleri vardır. Bir para birimi yalnızca kasada hiç yoksa kaldırılabilir; kasa yalnızca hiç kullanılmadıysa silinebilir."),
    "allSafes": ("All safes together", "كل القاصات معاً", "Tüm kasalar birlikte"),
    "allSafesFilter": ("All safes", "كل القاصات", "Tüm kasalar"),
    "intoSafe": ("Into safe", "إلى القاصة", "Girdiği kasa"),
    "outOfSafe": ("Paid from safe", "يُدفع من القاصة", "Ödendiği kasa"),
})
group("cash.tab", {"safes": ("Safes", "القاصات", "Kasalar")})
group("cash.kind", {"TRANSFER": ("Transfer", "تحويل", "Transfer")})
group("cash.new", {"TRANSFER": ("Transfer", "تحويل بين القاصات", "Kasalar arası transfer")})
group("cash.save", {"TRANSFER": ("Save transfer", "حفظ التحويل", "Transferi kaydet")})
group("cash.help", {
    "TRANSFER": ("Move money of one currency from one safe to another. The total doesn't change.", "نقل مبلغ بعملة واحدة من قاصة إلى أخرى. المجموع لا يتغير.", "Bir para birimindeki parayı bir kasadan diğerine taşıyın. Toplam değişmez."),
    "EXCHANGE": ("Change money from one currency into another. Type any two of the three boxes — amount you give, rate, amount you receive — and the third is calculated. The money can go into another safe.", "تحويل مبلغ من عملة إلى أخرى. اكتب أي خانتين من الثلاث — المبلغ المدفوع، السعر، المبلغ المستلم — والثالثة تُحسب تلقائياً. يمكن أن يدخل المبلغ إلى قاصة أخرى.", "Parayı bir para biriminden diğerine çevirin. Üç kutudan herhangi ikisini yazın — verilen tutar, kur, alınan tutar — üçüncüsü hesaplanır. Para başka bir kasaya girebilir."),
})
add("cash.intro", "Money in each safe, per currency. Sales and money put in add to a safe; purchases and expenses take from it.", "الأموال في كل قاصة حسب العملة. المبيعات والإيداعات تزيدها؛ المشتريات والمصاريف تُنقصها.", "Her kasadaki para, para birimine göre. Satışlar ve yatırılan para kasaya eklenir; alımlar ve giderler kasadan çıkar.")
add("cash.rate", "Rate: 1 {from} = ? {to}", "السعر: 1 {from} = ? {to}", "Kur: 1 {from} = ? {to}")
group("perm.actions", {"transfer": ("Transfer between safes", "تحويل بين القاصات", "Kasalar arası transfer")})
group("history.cash", {
    "transfer": ("Money moved between safes", "نقل أموال بين القاصات", "Kasalar arası para taşındı"),
    "safeCreate": ("Safe added", "إضافة قاصة", "Kasa eklendi"),
    "safeUpdate": ("Safe changed", "تعديل قاصة", "Kasa değiştirildi"),
    "safeDelete": ("Safe deleted", "حذف قاصة", "Kasa silindi"),
})
group("nt.cash.transfer", {"title": ("Transfer {number}: {amount}", "تحويل {number}: {amount}", "Transfer {number}: {amount}"), "body": ("{from} → {to} · by {by}", "من {from} إلى {to} · بواسطة {by}", "{from} → {to} · {by}")})
group("audit.entity", {"Safe": ("Safe", "قاصة", "Kasa")})
group("rep.col", {"safe": ("Safe", "القاصة", "Kasa")})
for i, loc in enumerate(["en", "ar", "tr"]):
    p = f"messages/{loc}.json"; d = json.load(open(p, encoding="utf-8"))
    for path, vals in S.items():
        node = d; parts = path.split(".")
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = vals[i]
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
print(len(S), "strings x 3")
