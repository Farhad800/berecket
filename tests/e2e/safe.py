"""The safe — money in / out / exchange, payments for Buy & Sell, still owed, EUR, permissions. EMPTY database.
   Start the app on :3001 against bereket_accept (see TESTING.md), then: python3 tests/e2e/safe.py"""
import os, re, csv, io, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
def bal(c): return float(sql(f"SELECT COALESCE(SUM(amount),0) FROM {Q('\"CashEntry\"')} WHERE currency='{c}'"))
PW="OwnerPass2026!"
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def cash(pg, typ, amount, currency="IQD", category=None, party=None, note=None, to=None, rate=None, save=True):
    pg.goto(B+f"/cash/new?type={typ}"); pg.wait_for_load_state("networkidle")
    pg.get_by_label("Currency you give" if typ=="EXCHANGE" else "Currency", exact=True).select_option(currency)
    if to: pg.get_by_label("Currency you receive").select_option(to)
    if typ=="EXCHANGE": pg.get_by_test_id("ex-from").fill(str(amount))
    else: pg.get_by_label("Amount", exact=True).fill(str(amount))
    if rate: pg.get_by_test_id("ex-rate").fill(str(rate))
    if category: pg.get_by_label("Spent on").select_option(label=category)
    if party: pg.get_by_label(re.compile("^(From|Paid to)$")).fill(party)
    if note: pg.get_by_label("Note").fill(note)
    if not save: return pg.inner_text("main")
    pg.get_by_role("button", name=re.compile("^Save (money in|expense|exchange)")).click()
    try: pg.wait_for_url(re.compile(r".*/cash/[^/]+\?saved=1$"), timeout=10000)
    except Exception: pass
    pg.wait_for_load_state("networkidle"); return pg.inner_text("main")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        pg=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    pw={}
    for eid,name,user,role,dept in [("1001","Sara Sales","sara","Sales Manager","Sales & Planning"),("1005","Walid Warehouse","walid","Warehouse Team","Warehouse")]:
        A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId",eid); A.fill("#fullName",name); A.fill("#username",user)
        A.select_option("#roleId", label=role); A.select_option("#departmentId", label=dept); A.click("form button[type=submit]")
        A.wait_for_selector("text=Temporary password"); temp=A.locator("code").nth(1).inner_text()
        pg=ctx(); login(pg,user,temp); pw[user]=f"{user.capitalize()}Factory2026"
        pg.fill("#current",temp); pg.fill("#next",pw[user]); pg.fill("#confirm",pw[user]); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.context.close()
    # the sales manager may sell and see the safe (switched on per role, like the factory will do)
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id, p FROM {Q('\"Role\"')} CROSS JOIN (VALUES ('stock:sell'),('cash:view')) v(p) WHERE name='Sales Manager'")
    for code,name,kind,unit in [("P-100","Bereket bowl 1800","PRODUCT","pcs"),("M-100","PP Hammada","MATERIAL","kg")]:
        sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('t{code}','{code}','{name}','{kind}','{unit}',now())")
    yr=sql("SELECT extract(year from now())::int")

    # 1. money in, three currencies kept apart
    A.goto(B+"/cash"); ck("safe page opens with IQD, USD and EUR at 0", all(A.get_by_test_id(f"bal-{c}").inner_text()==f"0 {c}" for c in ["IQD","USD","EUR"]))
    out=cash(A,"IN","10000000","IQD",party="Owner",note="Opening cash")
    ck("money in 10,000,000 IQD → CIN number", f"CIN-{yr}-0001" in out and bal("IQD")==10_000_000)
    cash(A,"IN","5000","USD",note="From the bank"); ck("money in 5,000 USD kept separately", bal("USD")==5000 and bal("IQD")==10_000_000)
    n=sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')}")
    cash(A,"IN","100","IQD"); ck("money in without where it came from is refused", sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')}")==n and "Write where the money came from" in A.inner_text("main"))

    # 2. expenses with categories; never more than the safe has
    cash(A,"OUT","1000","IQD"); ck("expense without a category is refused", "Choose what the money was spent on" in A.inner_text("main"))
    out=cash(A,"OUT","2500000","IQD",category="Salaries",party="October salaries")
    ck("expense 2,500,000 IQD (Salaries) → COUT, 7,500,000 left", f"COUT-{yr}-0001" in out and bal("IQD")==7_500_000 and "Salaries" in out)
    form=cash(A,"OUT","9000000","IQD",category="Electricity",save=False)
    ck("more than the safe has: warned and the save button is off", "More than the safe has" in form and A.get_by_role("button", name="Save expense").is_disabled())
    ck("…the server also refuses it (balance unchanged)", bal("IQD")==7_500_000)

    # 3. exchange inside the safe
    out=cash(A,"EXCHANGE","1000","USD",to="IQD",rate="1450",save=False)
    ck("exchange shows what you receive (1,450,000 IQD)", A.get_by_test_id("ex-to").input_value()=="1450000")
    A.get_by_role("button", name="Save exchange").click(); A.wait_for_url(re.compile(r".*/cash/[^/]+\?saved=1$")); out=A.inner_text("main")
    ck("exchange EXC: USD −1,000, IQD +1,450,000", f"EXC-{yr}-0001" in out and bal("USD")==4000 and bal("IQD")==8_950_000 and "−1,000 USD" in out and "+1,450,000 IQD" in out)
    cash(A,"EXCHANGE","9999","USD",to="IQD",rate="1450",save=False); ck("can't exchange more than the safe has", A.get_by_role("button", name="Save exchange").is_disabled())

    # 4. conversion view (nothing changes)
    A.goto(B+"/cash"); ck("converter starts at the last rate and totals the safe in IQD", A.get_by_label("1 USD in IQD").input_value()=="1450" and A.get_by_test_id("converted").inner_text()=="14,750,000 IQD")
    A.get_by_label("Show in").select_option("USD"); ck("…or in USD", A.get_by_test_id("converted").inner_text().startswith("10,172.41"))
    ck("…and the balances did not change", bal("IQD")==8_950_000 and bal("USD")==4000)

    # 5. buy in EUR, paid later from the safe
    stock_doc(A, B, "BUY", [("M-100","100","2")], party="Euro Polymers", currency="EUR", paid=200)
    ck("buy fully paid in EUR refused: the safe has no EUR", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")=="0" and "\"Main safe\" has only 0 EUR" in A.inner_text("main"))
    out=stock_doc(A, B, "BUY", [("M-100","100","2")], party="Euro Polymers", currency="EUR", paid=0)
    did=A.url.split("/")[-1].split("?")[0]
    ck("buy saved unpaid: 200 EUR still owed", "/stock/" in A.url and "200 EUR" in out and bal("EUR")==0)
    cash(A,"IN","500","EUR",note="Euro cash from the owner")
    A.goto(B+f"/stock/{did}"); A.get_by_label("Amount").fill("150"); A.get_by_role("button", name="Pay", exact=True).click(); A.wait_for_timeout(1500); out=A.inner_text("main")
    ck("pay 150 EUR later → PAY number, 50 still owed, safe 350 EUR", f"PAY-{yr}-0001" in out and bal("EUR")==350 and "50 EUR" in out)
    A.get_by_label("Amount").fill("100"); A.get_by_role("button", name="Pay", exact=True).click(); A.wait_for_timeout(1500)
    ck("can't pay more than is owed", "Only 50 EUR is still owed" in A.inner_text("main") and bal("EUR")==350)
    A.get_by_label("Amount").fill("50"); A.get_by_role("button", name="Pay", exact=True).click(); A.wait_for_timeout(1500)
    ck("paid in full: nothing owed, pay box gone", bal("EUR")==300 and A.get_by_role("button", name="Pay", exact=True).count()==0)

    # 6. the sales manager sells; part paid now, the rest later
    S=ctx(); login(S,"sara",pw["sara"])
    out=stock_doc(S, B, "SELL", [("P-100",100,"25000")], party="Al Noor Market", currency="IQD", paid="1000000")
    sid=S.url.split("/")[-1].split("?")[0]
    ck("sale 2,500,000 IQD with 1,000,000 received → RCV, safe +1,000,000", f"RCV-{yr}-0001" in out and bal("IQD")==9_950_000)
    A.goto(B+"/cash?tab=owed"); ow=A.inner_text("main")
    ck("still-owed tab: customer owes 1,500,000 IQD; Euro Polymers not in the owes-us list", "Al Noor Market" in ow and "1,500,000 IQD" in ow and "Euro Polymers" not in ow)
    S.goto(B+f"/stock/{sid}"); S.get_by_role("button", name="Receive payment").click(); S.wait_for_timeout(1500)
    ck("sales receives the rest: safe 11,450,000 IQD, nothing owed", bal("IQD")==11_450_000 and S.get_by_role("button", name="Receive payment").count()==0)
    S.goto(B+"/cash"); ck("sales can see the safe but has no money in/out buttons", "11,450,000 IQD" in S.inner_text("main") and S.locator("a[href^='/cash/new']").count()==0)
    S.goto(B+"/cash/new?type=OUT"); ck("…and can't open the expense form", "/forbidden" in S.url)

    # 7. warehouse team has no access to the safe
    W=ctx(); login(W,"walid",pw["walid"])
    ck("warehouse: no Safe in the menu", W.locator("a[href='/cash']").count()==0)
    W.goto(B+"/cash"); ck("…and the page is forbidden", "/forbidden" in W.url)
    W.goto(B+"/reports"); ck("…and no money reports", "Safe: money in and out" not in W.inner_text("main"))
    ck("…nor its CSV", W.request.get(B+"/api/reports/cash").status in (403,404))

    # 8. expense categories
    A.goto(B+"/cash?tab=categories"); A.get_by_label("New category name").fill("Packing tape"); A.get_by_role("button", name="Add").click(); A.wait_for_timeout(1200)
    A.goto(B+"/cash/new?type=OUT"); ck("new category can be chosen", A.get_by_label("Spent on").locator("option", has_text="Packing tape").count()==1)
    A.goto(B+"/cash?tab=categories"); A.locator("li", has_text="Packing tape").get_by_role("button", name="Hide").click(); A.wait_for_timeout(1200)
    A.goto(B+"/cash/new?type=OUT"); ck("hidden category no longer offered", A.get_by_label("Spent on").locator("option", has_text="Packing tape").count()==0)

    # 9. reports, search, audit, notifications
    day=sql("SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text")   # the factory's calendar day, as the app uses
    A.goto(B+f"/reports/cash?from={day}&to={day}"); rt=A.inner_text("main")
    ck("safe report lists entries with totals per currency", "Salaries" in rt and "Euro Polymers" in rt and "In (EUR)" in rt)
    r=A.request.get(B+f"/api/reports/cash?from={day}&to={day}"); rows=list(csv.reader(io.StringIO(r.body().decode("utf-8").lstrip("﻿"))))
    ck("safe report exports to CSV", r.status==200 and len(rows)>=10)
    A.goto(B+f"/reports/trade?from={day}&to={day}"); ck("trade report shows EUR purchases", "Bought (EUR)" in A.inner_text("main"))
    A.goto(B+f"/search?q=EXC-{yr}-0001"); ck("search opens the exchange", "/cash/" in A.url and "1,450,000" in A.inner_text("main"))
    acts=set(sql(f"SELECT DISTINCT action FROM {Q('\"AuditLog\"')}").split("\n"))
    ck("audit log has cash.in/out/exchange/pay/receive", {"cash.in","cash.out","cash.exchange","cash.pay","cash.receive","cash.categoryAdd"}<=acts)
    ck("sales manager notified of the expense", sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='sara' AND n.type='cash.out'")=="1")
    ck("warehouse not notified of money", sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='walid' AND n.type LIKE 'cash.%'")=="0")
    ck("no currency ever below zero", all(bal(c)>=0 for c in ["IQD","USD","EUR"]))

    # 10. phone + Arabic
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/cash","/cash?tab=owed","/cash/new?type=EXCHANGE",f"/stock/{did}"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+"/cash"); ck("Arabic page opens", "الخزنة" in A.inner_text("main") and "رواتب" in A.inner_text("main"))
    A.context.add_cookies([{"name":"bfms_locale","value":"en","url":B}])

    # 11. go-live reset empties the safe, keeps categories
    A.goto(B+"/admin?tab=system"); A.fill("#confirm","RESET"); A.fill("#reset-password",PW); A.get_by_role("button", name="Delete test transactions").click(); A.wait_for_timeout(2500)
    ck("go-live reset empties the safe and keeps the categories", sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')}")=="0" and int(sql(f"SELECT count(*) FROM {Q('\"ExpenseCategory\"')}"))==9 and sql(f"SELECT count(*) FROM {Q('\"Counter\"')} WHERE name LIKE 'cash%'")=="0")
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
