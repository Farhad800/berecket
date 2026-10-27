"""One customer list for buying and selling (owner, 27 Oct 2026; suppliers merged into customers), automatic purchase
numbers, paid starts at 0, purchase discounts, plastic handles as a made-in-house part, and the day's rate on purchases.
Balance: − = they owe the factory; a purchase from them or money received raises it, a sale or money paid to them lowers it.
EMPTY database. Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/accounts.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc, pick_customer
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
P=Q('"Product"'); D=Q('"StockDoc"')
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def stock(code): return float(sql(f"SELECT coalesce(sum(qty),0) FROM {Q('\"StockMovement\"')} m JOIN {P} p ON p.id=m.{Q('\"productId\"')} WHERE p.code='{code}'"))
def doc_id(pg): return pg.url.split("/")[-1].split("?")[0]

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        pg=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId","1005"); A.fill("#fullName","Walid Warehouse"); A.fill("#username","walid")
    A.select_option("#roleId", label="Warehouse Team"); A.select_option("#departmentId", label="Warehouse"); A.click("form button[type=submit]")
    A.wait_for_selector("text=Temporary password"); temp=A.locator("code").nth(1).inner_text()
    W=ctx(); login(W,"walid",temp); W.fill("#current",temp); W.fill("#next","WalidFactory2026"); W.fill("#confirm","WalidFactory2026"); W.click("button[type=submit]"); W.wait_for_url("**/dashboard", wait_until="commit")
    for i,code,name,kind,unit,cost in [("tppgranule1","PP-01","PP granules","MATERIAL","kg",3000),("tcarton0001","CART-100","Carton 100","PACKAGING","pcs",1000),("thandle0001","H-01","Plastic handle","PRODUCT","pcs",None),("tbucket0001","B-01","Bucket 8 kg","PRODUCT","pcs",None),("tmetalhand1","MH-01","Metal handle","MATERIAL","pcs",250)]:
        sql(f"INSERT INTO {P} (id,code,name,kind,unit,{Q('\"costIqd\"')},{Q('\"costPrice\"')},{Q('\"costCurrency\"')},{Q('\"costRate\"')},{Q('\"updatedAt\"')}) VALUES ('{i}','{code}','{name}','{kind}','{unit}',{cost or 'NULL'},{cost or 'NULL'},{chr(39)+'IQD'+chr(39) if cost else 'NULL'},{1 if cost else 'NULL'},now())")
    yr=sql("SELECT extract(year from now())::int")
    stock_doc(A, B, "INPUT", [("PP-01",1000,None)], reason="COUNT")
    A.goto(B+"/cash/new?type=IN"); A.get_by_label("Amount", exact=True).fill("5000000"); A.get_by_label("Note").fill("Owner"); A.get_by_role("button", name="Save money in").click(); A.wait_for_timeout(1500)
    A.goto(B+"/cash/new?type=IN"); A.get_by_label("Currency", exact=True).select_option("USD"); A.get_by_label("Amount", exact=True).fill("5000"); A.get_by_label("Note").fill("Owner"); A.get_by_role("button", name="Save money in").click(); A.wait_for_timeout(1500)

    # ── 1–3. Buy: customer account, automatic purchase number, paid starts at 0
    A.goto(B+"/stock/new?type=BUY"); A.wait_for_load_state("networkidle")
    ck("buy form: paid now starts at 0", A.get_by_label("Paid now").input_value()=="0")
    ck("buy form: customer box with New customer, their invoice no. and automatic purchase number hint", A.locator("[id=customerId]").count()==1 and A.get_by_role("button", name="New customer").count()==1 and A.get_by_label("Their invoice no.").count()==1 and "PUR-" in A.inner_text("main"))
    before=sql(f"SELECT count(*) FROM {D}")
    stock_doc(A, B, "BUY", [("PP-01",100,"2000")], currency="IQD")
    ck("a purchase without a customer is refused", sql(f"SELECT count(*) FROM {D}")==before and "Choose the customer" in A.inner_text("main"))
    # 4. discounts: 10% on the line, 5,000 off the invoice
    out=stock_doc(A, B, "BUY", [("PP-01",100,"2000",(10,"%"))], party="Gulf Polymers", phone="0750 111 2222", currency="IQD", invoice="GP-778", discount=(5000,"amount"))
    bid=doc_id(A)
    ck(f"customer C-0001 made inline on a purchase; PUR-{yr}-0001 with their invoice GP-778", sql(f"SELECT code||'|'||name||'|'||coalesce(phone,'') FROM {Q('\"Customer\"')}")=="C-0001|Gulf Polymers|0750 111 2222" and f"PUR-{yr}-0001" in out and "GP-778" in out and f"BUY-{yr}-0001" in out)
    ck("discounts: 200,000 − 10% − 5,000 = 175,000 owed to them", sql(f"SELECT subtotal::float||'|'||discount::float||'|'||total::float FROM {D} WHERE id='{bid}'")=="180000|5000|175000")
    ck("the line keeps the bought price 2,000 (discount kept apart)", sql(f"SELECT {Q('\"unitPrice\"')}::float||'|'||discount::float FROM {Q('\"StockMovement\"')} WHERE {Q('\"docId\"')}='{bid}'")=="2000|20000")
    ck("nothing paid, nothing left the safe", sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')} WHERE {Q('\"stockDocId\"')}='{bid}'")=="0" and "175,000" in out)
    ck("stock +100 kg, item cost unchanged (3,000)", stock("PP-01")==1100 and sql(f"SELECT {Q('\"costIqd\"')}::float FROM {P} WHERE code='PP-01'")=="3000")
    A.goto(B+"/stock/new?type=SELL"); ck("sell form: received now also starts at 0", A.get_by_label("Received now").input_value()=="0")
    # Paid in full button
    A.goto(B+"/stock/new?type=BUY"); pick_customer(A,"Gulf Polymers")
    row=A.locator("main ul.divide-y > li").nth(0); row.locator("[id^=item_]").click(); A.keyboard.type("PP-01"); A.wait_for_timeout(250); A.keyboard.press("Enter")
    row.locator("input[type=number]").nth(0).fill("10"); row.locator("input[type=number]").nth(1).fill("2000")
    A.get_by_role("button", name="Paid in full").click(); ck("Paid in full fills the total (20,000)", A.get_by_label("Paid now").input_value()=="20000")
    ck("the form shows their balance (175,000: the factory owes them)", "Balance now: 175,000 IQD" in A.inner_text("main"))

    # ── 6. buying in USD: the day's rate is asked; they are owed USD; item cost unchanged
    out=stock_doc(A, B, "BUY", [("PP-01",50,"1.5")], party="Turkish Polymers", currency="USD", rate=1460, paid=25, save=False)
    ck("USD purchase asks for the rate and shows the IQD value (75 × 1,460 = 109,500)", A.get_by_test_id("buy-iqd").inner_text().replace(" "," ")=="Value in IQD: 109,500 IQD")
    r=A.get_by_label("Rate of the day"); r.click(); r.hover(); A.mouse.wheel(0,-300); A.mouse.wheel(0,300); A.wait_for_timeout(200)
    pr=A.locator("main ul.divide-y > li").nth(0).locator("input[type=number]").nth(1); pr.click(); pr.hover(); A.mouse.wheel(0,300); A.wait_for_timeout(200)
    ck("the mouse wheel does not change the rate or the price", r.input_value()=="1460" and pr.input_value()=="1.5")
    A.get_by_role("button", name=re.compile("^Save purchase")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); uid=doc_id(A); out=A.inner_text("main")
    ck("purchase page: balance +50 USD with the one sign hint", "50 USD" in A.get_by_test_id("customer-balance").inner_text() and "the factory owes them" in A.get_by_test_id("customer-balance").inner_text())
    ck("saved with the rate 1 USD = 1,460 IQD and owed in USD", sql(f"SELECT currency||'|'||total::float||'|'||rate::float FROM {D} WHERE id='{uid}'")=="USD|75|1460" and "1 USD = 1,460 IQD" in out and A.get_by_test_id("doc-iqd").count()==1)
    ck("25 USD paid from the safe, booked to the customer", sql(f"SELECT amount::float||'|'||currency FROM {Q('\"CashEntry\"')} WHERE {Q('\"stockDocId\"')}='{uid}'")=="-25|USD" and sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')} WHERE {Q('\"customerId\"')} IS NOT NULL")=="1")
    ck("item cost still 3,000 IQD (buying never changes it)", sql(f"SELECT {Q('\"costIqd\"')}::float FROM {P} WHERE code='PP-01'")=="3000")
    stock_doc(A, B, "BUY", [("PP-01",1,"1")], party="Turkish Polymers", currency="USD", save=False)
    A.get_by_label("Rate of the day").fill(""); n=sql(f"SELECT count(*) FROM {D}")
    A.get_by_role("button", name=re.compile("^Save purchase")).click(); A.wait_for_timeout(1500)
    ck("a USD purchase without the rate is refused", sql(f"SELECT count(*) FROM {D}")==n and "rate" in A.inner_text("main").lower())

    # ── one account: bought from and sold to; list, page, statement, pay, receive, still owed, receipt
    A.goto(B+"/customers"); txt=A.inner_text("main")
    ck("Customers list: C-0001 Gulf Polymers 175,000 IQD, C-0002 Turkish Polymers 50 USD (the factory owes them)", "C-0001" in txt and "175,000 IQD" in txt and "C-0002" in txt and "50 USD" in txt and A.get_by_test_id("weowe-IQD").inner_text()=="+175,000 IQD")
    ck("no Suppliers menu any more", A.locator("nav a[href='/suppliers']").count()==0)
    gid=sql(f"SELECT id FROM {Q('\"Customer\"')} WHERE code='C-0001'")
    A.goto(B+f"/customers/{gid}"); ck("customer page: balance 175,000 IQD, the factory owes the customer", A.get_by_test_id("balance-IQD").inner_text()=="175,000 IQD" and "The factory owes the customer" in A.inner_text("main") and A.get_by_role("link", name="New purchase").count()==1 and A.get_by_role("link", name="New sale").count()==1)
    A.get_by_label("Amount paid").fill("100000"); A.get_by_label("Note on the money paid").fill("cash"); A.get_by_role("button", name="Save money paid").click(); A.wait_for_timeout(1500)
    ck("pay them 100,000 from the safe → balance 75,000", A.get_by_test_id("balance-IQD").inner_text()=="75,000 IQD" and sql(f"SELECT sum(amount)::float FROM {Q('\"CashEntry\"')} WHERE currency='IQD'")=="4900000")
    # the same name, now sold to
    stock_doc(A, B, "SELL", [("PP-01",10,"9000")], party="Gulf Polymers", currency="IQD")
    ck("selling to the same customer: one account, no new customer", sql(f"SELECT count(*) FROM {Q('\"Customer\"')}")=="2" and sql(f"SELECT count(*) FROM {D} WHERE {Q('\"customerId\"')}='{gid}'")=="2")
    A.goto(B+f"/customers/{gid}")
    ck("sale 90,000 lowers it: 75,000 − 90,000 = −15,000 (they owe the factory)", A.get_by_test_id("balance-IQD").inner_text()=="-15,000 IQD" and "The customer owes the factory" in A.inner_text("main"))
    A.get_by_label("Amount received").fill("15000"); A.get_by_role("button", name="Save payment").click(); A.wait_for_timeout(1500)
    ck("money received 15,000 → settled (0)", A.get_by_test_id("balance-IQD").inner_text()=="0 IQD")
    t=A.inner_text("main")
    ck("statement: purchase +175,000, paid to them −100,000, sale −90,000, received +15,000", all(x in t for x in [f"BUY-{yr}-0001","+175,000 IQD","-100,000 IQD","-90,000 IQD","+15,000 IQD","Purchase","Paid to them","Sale","Money received"]))
    A.goto(B+"/cash?tab=owed"); ow=A.inner_text("main")
    ck("safe 'still owed': the factory owes Turkish Polymers +50 USD; Gulf Polymers settled", "Turkish Polymers" in ow and "+50 USD" in ow and "Gulf Polymers" not in ow)
    A.goto(B+f"/print/receipt/doc/{bid}"); rc=A.inner_text("main")
    ck("purchase receipt: customer code, their invoice, discount, previous 0 / new balance 175,000 and the one sign hint", all(x in rc for x in ["C-0001","GP-778","175,000","اسم الزبون","المعمل مدين له"]))
    A.goto(B+f"/search?q=C-0001"); ck("search finds the customer by code", f"/customers/{gid}" in A.url or "Gulf Polymers" in A.inner_text("main"))
    A.goto(B+"/suppliers"); ck("old Suppliers link opens the Customers list", A.url.endswith("/customers"))

    # ── 5. plastic handle made in the factory and used in a bucket
    sql(f"INSERT INTO {Q('\"ProductComponent\"')} (id,{Q('\"productId\"')},{Q('\"componentId\"')},qty,per) VALUES ('h1','thandle0001','tppgranule1',20,'PIECE'),('b1','tbucket0001','tppgranule1',500,'PIECE'),('b2','tbucket0001','thandle0001',1,'PIECE'),('b3','tbucket0001','tcarton0001',100,'CARTON')")
    A.goto(B+"/products/thandle0001"); ck("plastic handle costs 60 IQD (20 g × 3,000/kg)", A.get_by_test_id("product-cost").inner_text()=="60 IQD")
    A.goto(B+"/products/tbucket0001"); A.get_by_test_id("cost-pieces").fill("100"); A.wait_for_timeout(200)
    ck("bucket: 500 g PP + plastic handle at its own cost + 1 carton → 1,570 IQD a piece", A.get_by_test_id("product-cost").inner_text()=="1,570 IQD" and "Plastic handle" in A.inner_text("main"))
    sql(f"UPDATE {Q('\"ProductComponent\"')} SET {Q('\"componentId\"')}='tmetalhand1' WHERE id='b2'")
    A.goto(B+"/products/tbucket0001"); A.get_by_test_id("cost-pieces").fill("100"); A.wait_for_timeout(200)
    ck("with a bought metal handle (250) instead → 1,760 IQD", A.get_by_test_id("product-cost").inner_text()=="1,760 IQD")
    sql(f"UPDATE {Q('\"ProductComponent\"')} SET {Q('\"componentId\"')}='thandle0001' WHERE id='b2'")
    A.goto(B+"/production/daily?shift=A")
    if A.locator("text=Only products in open orders").count(): A.uncheck("text=Only products in open orders")
    A.fill("input[name='qty_thandle0001']","300"); A.fill("input[name='qty_tbucket0001']","100"); A.get_by_role("button", name="Save all").click(); A.wait_for_timeout(2500)
    ck(f"making 300 handles and 100 buckets: handles 300 − 100 = 200 in stock, PP 1,150 − 10 sold − 6 − 50 ({stock('H-01')}, {stock('PP-01')})", stock("H-01")==200 and stock("B-01")==100 and abs(stock("PP-01")-1084)<1e-6)
    A.goto(B+"/inventory"); ck("warehouse lists the handle as a product with its cost", A.get_by_test_id("cost-H-01").inner_text().split("\n")[0]=="60")

    # ── permissions, phone, Arabic
    W.goto(B+"/customers"); ck("warehouse can't open customers", "/forbidden" in W.url)
    ck("audit log: customer added, purchase, payment, sale, receipt", {"customer.create","stock.buy","cash.pay","stock.sell","cash.receive"}<=set(sql(f"SELECT string_agg(DISTINCT action, ',') FROM {Q('\"AuditLog\"')}").split(",")))
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/customers",f"/customers/{gid}","/stock/new?type=BUY",f"/stock/{bid}"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+f"/customers/{gid}"); ck("Arabic customer page with purchases and sales", "شراء" in A.inner_text("main") and "بيع" in A.inner_text("main"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
