"""Supplier accounts, automatic purchase numbers, paid starts at 0, purchase discounts, plastic handles as a
made-in-house part, and the day's rate on purchases (accountant, 27 Oct 2026). EMPTY database.
Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/suppliers.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc, pick_supplier
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

    # ── 1–3. Buy: supplier account, automatic purchase number, paid starts at 0
    A.goto(B+"/stock/new?type=BUY"); A.wait_for_load_state("networkidle")
    ck("buy form: paid now starts at 0", A.get_by_label("Paid now").input_value()=="0")
    ck("buy form: supplier box with New supplier, supplier's invoice no. and automatic purchase number hint", A.locator("[id=supplierId]").count()==1 and A.get_by_role("button", name="New supplier").count()==1 and A.get_by_label("Supplier's invoice no.").count()==1 and "PUR-" in A.inner_text("main"))
    before=sql(f"SELECT count(*) FROM {D}")
    stock_doc(A, B, "BUY", [("PP-01",100,"2000")], currency="IQD")
    ck("a purchase without a supplier is refused", sql(f"SELECT count(*) FROM {D}")==before and "Choose the supplier" in A.inner_text("main"))
    # 4. discounts: 10% on the line, 5,000 off the invoice
    out=stock_doc(A, B, "BUY", [("PP-01",100,"2000",(10,"%"))], party="Gulf Polymers", phone="0750 111 2222", currency="IQD", invoice="GP-778", discount=(5000,"amount"))
    bid=doc_id(A)
    ck(f"supplier S-0001 made inline; purchase PUR-{yr}-0001 with the supplier's invoice GP-778", sql(f"SELECT code||'|'||name||'|'||coalesce(phone,'') FROM {Q('\"Supplier\"')}")=="S-0001|Gulf Polymers|0750 111 2222" and f"PUR-{yr}-0001" in out and "GP-778" in out and f"BUY-{yr}-0001" in out)
    ck("discounts: 200,000 − 10% − 5,000 = 175,000 owed to the supplier", sql(f"SELECT subtotal::float||'|'||discount::float||'|'||total::float FROM {D} WHERE id='{bid}'")=="180000|5000|175000")
    ck("the line keeps the bought price 2,000 (discount kept apart)", sql(f"SELECT {Q('\"unitPrice\"')}::float||'|'||discount::float FROM {Q('\"StockMovement\"')} WHERE {Q('\"docId\"')}='{bid}'")=="2000|20000")
    ck("nothing paid, nothing left the safe", sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')} WHERE {Q('\"stockDocId\"')}='{bid}'")=="0" and "175,000" in out)
    ck("stock +100 kg, item cost unchanged (3,000)", stock("PP-01")==1100 and sql(f"SELECT {Q('\"costIqd\"')}::float FROM {P} WHERE code='PP-01'")=="3000")
    A.goto(B+"/stock/new?type=SELL"); ck("sell form: received now also starts at 0", A.get_by_label("Received now").input_value()=="0")
    # Paid in full button
    A.goto(B+"/stock/new?type=BUY"); pick_supplier(A,"Gulf Polymers")
    row=A.locator("main ul.divide-y > li").nth(0); row.locator("[id^=item_]").click(); A.keyboard.type("PP-01"); A.wait_for_timeout(250); A.keyboard.press("Enter")
    row.locator("input[type=number]").nth(0).fill("10"); row.locator("input[type=number]").nth(1).fill("2000")
    A.get_by_role("button", name="Paid in full").click(); ck("Paid in full fills the total (20,000)", A.get_by_label("Paid now").input_value()=="20000")
    ck("the form shows the supplier's balance (−175,000)", "-175,000" in A.inner_text("main"))

    # ── 6. buying in USD: the day's rate is asked; the supplier is owed USD; item cost unchanged
    out=stock_doc(A, B, "BUY", [("PP-01",50,"1.5")], party="Turkish Polymers", currency="USD", rate=1460, paid=25, save=False)
    ck("USD purchase asks for the rate and shows the IQD value (75 × 1,460 = 109,500)", A.get_by_test_id("buy-iqd").inner_text().replace(" "," ")=="Value in IQD: 109,500 IQD")
    A.get_by_role("button", name=re.compile("^Save purchase")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); uid=doc_id(A); out=A.inner_text("main")
    ck("saved with the rate 1 USD = 1,460 IQD and owed in USD", sql(f"SELECT currency||'|'||total::float||'|'||rate::float FROM {D} WHERE id='{uid}'")=="USD|75|1460" and "1 USD = 1,460 IQD" in out and A.get_by_test_id("doc-iqd").count()==1)
    ck("25 USD paid from the safe, booked to the supplier", sql(f"SELECT amount::float||'|'||currency FROM {Q('\"CashEntry\"')} WHERE {Q('\"stockDocId\"')}='{uid}'")=="-25|USD" and sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')} WHERE {Q('\"supplierId\"')} IS NOT NULL")=="1")
    ck("item cost still 3,000 IQD (buying never changes it)", sql(f"SELECT {Q('\"costIqd\"')}::float FROM {P} WHERE code='PP-01'")=="3000")
    stock_doc(A, B, "BUY", [("PP-01",1,"1")], party="Turkish Polymers", currency="USD", save=False)
    A.get_by_label("Rate of the day").fill(""); n=sql(f"SELECT count(*) FROM {D}")
    A.get_by_role("button", name=re.compile("^Save purchase")).click(); A.wait_for_timeout(1500)
    ck("a USD purchase without the rate is refused", sql(f"SELECT count(*) FROM {D}")==n and "rate" in A.inner_text("main").lower())

    # ── supplier accounts: list, page, statement, pay, still owed, receipt
    A.goto(B+"/suppliers"); txt=A.inner_text("main")
    ck("Suppliers list: S-0001 Gulf Polymers −175,000 IQD, S-0002 Turkish Polymers −50 USD", "S-0001" in txt and "-175,000 IQD" in txt and "S-0002" in txt and "-50 USD" in txt)
    gid=sql(f"SELECT id FROM {Q('\"Supplier\"')} WHERE code='S-0001'")
    A.goto(B+f"/suppliers/{gid}"); ck("supplier page: balance −175,000 IQD, the factory owes the supplier", A.get_by_test_id("balance-IQD").inner_text()=="-175,000 IQD" and "The factory owes the supplier" in A.inner_text("main"))
    A.get_by_label("Amount paid").fill("100000"); A.get_by_label("Payment note").fill("cash"); A.get_by_role("button", name="Save payment").click(); A.wait_for_timeout(1500)
    ck("pay the supplier 100,000 from the safe → balance −75,000", A.get_by_test_id("balance-IQD").inner_text()=="-75,000 IQD" and sql(f"SELECT sum(amount)::float FROM {Q('\"CashEntry\"')} WHERE currency='IQD'")=="4900000")
    ck("statement lists the purchase (−175,000) and the payment (+100,000)", all(x in A.inner_text("main") for x in [f"BUY-{yr}-0001","-175,000 IQD","+100,000 IQD"]))
    A.goto(B+"/cash?tab=owed"); ck("safe 'still owed' lists the suppliers we owe", "Gulf Polymers" in A.inner_text("main") and "75,000 IQD" in A.inner_text("main") and "Turkish Polymers" in A.inner_text("main"))
    A.goto(B+f"/print/receipt/doc/{bid}"); rc=A.inner_text("main")
    ck("purchase receipt: supplier code, supplier's invoice, discount, previous 0 / new balance −175,000 and the supplier sign hint", all(x in rc for x in ["S-0001","GP-778","-175,000","المعمل مدين للمورد"]))
    A.goto(B+f"/search?q=S-0001"); ck("search finds the supplier by code", "/suppliers/" in A.url or "Gulf Polymers" in A.inner_text("main"))

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
    ck(f"making 300 handles and 100 buckets: handles 300 − 100 = 200 in stock, PP 1,150 − 6 − 50 ({stock('H-01')}, {stock('PP-01')})", stock("H-01")==200 and stock("B-01")==100 and abs(stock("PP-01")-1094)<1e-6)
    A.goto(B+"/inventory"); ck("warehouse lists the handle as a product with its cost", A.get_by_test_id("cost-H-01").inner_text().split("\n")[0]=="60")

    # ── permissions, phone, Arabic
    W.goto(B+"/suppliers"); ck("warehouse can't open suppliers", "/forbidden" in W.url)
    ck("audit log: supplier added, purchase, payment", {"supplier.create","stock.buy","cash.pay"}<=set(sql(f"SELECT string_agg(DISTINCT action, ',') FROM {Q('\"AuditLog\"')}").split(",")))
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/suppliers",f"/suppliers/{gid}","/stock/new?type=BUY",f"/stock/{bid}"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+f"/suppliers/{gid}"); ck("Arabic supplier page", "المعمل مدين للمورد" in A.inner_text("main"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
