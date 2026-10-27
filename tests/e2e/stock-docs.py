"""Stock Movements section — Input / Output / Buy / Sell documents, on an EMPTY database.
   Start the app on :3001 against bereket_accept (see TESTING.md), then: python3 tests/e2e/stock-docs.py"""
import os, re, csv, io, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc, pick_customer
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
def stock(code): return float(sql(f"SELECT COALESCE(SUM(m.qty),0) FROM {Q('\"StockMovement\"')} m JOIN {Q('\"Product\"')} p ON p.id=m.{Q('\"productId\"')} WHERE p.code='{code}'"))
PW="OwnerPass2026!"
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")

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
    items=[("P-100","Bereket bowl 1800","PRODUCT","pcs"),("S-100","Bereket bowl label","STICKER","pcs"),("M-100","PP Hammada","MATERIAL","kg")]
    for code,name,kind,unit in items:
        sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('t{code}','{code}','{name}','{kind}','{unit}',now())")

    # sales: an order of 500 bowls
    S=ctx(); login(S,"sara",pw["sara"]); S.goto(B+"/orders/new"); S.fill("input[aria-label='P-100 Quantity']","500")
    S.get_by_role("button", name=re.compile("^(Save order|Save)$")).click(); S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); S.wait_for_load_state("networkidle")
    oid=S.url.split("/")[-1]; onum=re.search(r"ORD-\d{4}-\d{4}", S.inner_text("main")).group(0)

    # 1. Buy with money
    A.goto(B+"/stock"); txt=A.inner_text("main")
    ck("stock movements page opens with 4 buttons for the owner", all(A.locator(f"a[href='/stock/new?type={t}']").count()==1 for t in ["INPUT","OUTPUT","BUY","SELL"]))
    out=stock_doc(A, B, "BUY", [("M-100","1000.5","2.5"),("S-100",20000,"0.01")], party="Gulf Polymers", invoice="INV-9", currency="USD", paid=0)
    yr=sql("SELECT extract(year from now())::int")
    ck("buy saved with its number BUY-YYYY-0001", f"BUY-{yr}-0001" in out and "/stock/" in A.url)
    ck("buy raised stock (1,000.5 kg / 20,000 labels)", abs(stock("M-100")-1000.5)<1e-6 and stock("S-100")==20000)
    ck("buy total 2,701.25 USD shown", "2,701.25" in out and "USD" in out and "Gulf Polymers" in out and "INV-9" in out)
    ck("price stored per line", sql(f"SELECT {Q('\"unitPrice\"')}::text FROM {Q('\"StockMovement\"')} WHERE type='BUY' AND {Q('\"productId\"')}='tM-100'")=="2.500000")
    before=sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")
    out=stock_doc(A, B, "BUY", [("M-100",5,"1")], currency="IQD")
    ck("buy without a supplier is refused", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==before and "/stock/new" in A.url)
    out=stock_doc(A, B, "SELL", [("P-100",5,None)], party="Xy Shop", currency="IQD")
    ck("sale without prices is refused", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==before)

    # 1b. small prices (0.005 per label) keep lines, total, receipt and "still owed" in agreement
    out=stock_doc(A, B, "BUY", [("S-100",20000,"0.005"),("M-100","1.5","1.234567")], party="Label printer", currency="USD", paid=0)
    sd=A.url.split("/")[-1].split("?")[0]
    ck("price with 6 decimals stored exactly", sql(f"SELECT {Q('\"unitPrice\"')}::text FROM {Q('\"StockMovement\"')} WHERE {Q('\"docId\"')}='{sd}' ORDER BY qty DESC LIMIT 1")=="0.005000")
    ck("lines 100 + 1.85, total 101.85 everywhere", sql(f"SELECT total::text FROM {Q('\"StockDoc\"')} WHERE id='{sd}'")=="101.85" and "0.005" in out and "101.85 USD" in out)
    A.goto(B+f"/print/receipt/doc/{sd}"); rc=A.inner_text("main")
    ck("receipt shows 0.005, line 100 and total 101.85", "0.005" in rc and "101.85 USD" in rc)
    n0=sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")
    stock_doc(A, B, "BUY", [("S-100",10,"0.0000001")], party="Xy Supplies", currency="USD", paid=0)
    ck("a price with 7 decimals is refused", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==n0)
    sql(f"DELETE FROM {Q('\"StockMovement\"')} WHERE {Q('\"docId\"')}='{sd}'"); sql(f"DELETE FROM {Q('\"StockDoc\"')} WHERE id='{sd}'")

    # 2. Input (no money, with a reason)
    out=stock_doc(A, B, "INPUT", [("P-100",800,None)], reason="RETURN")
    ck("input of 800 bowls → 800 in stock; numbered IN-", stock("P-100")==800 and f"IN-{yr}-0001" in out)
    n=sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")
    stock_doc(A, B, "INPUT", [("P-100",10,None)])
    ck("input without a reason is refused", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==n)

    # 3. Sell linked to the order, filled from it
    A.goto(B+f"/stock/new?type=SELL&order={oid}"); A.wait_for_load_state("networkidle")
    A.get_by_title("Fill the lines from this order").click(); A.wait_for_timeout(300)
    pick_customer(A, "Al Noor Market"); A.get_by_label("Currency").select_option("IQD")
    A.locator("main ul.divide-y > li").first.locator("input[type=number]").nth(1).fill("1500")
    ck("fill from order put 500 bowls in the sale", A.locator("main ul.divide-y > li").first.locator("input[type=number]").first.input_value()=="500")
    A.get_by_role("button", name=re.compile("^Save sale")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); out=A.inner_text("main")
    ck("sale saved SAL-, 750,000 IQD, stock 300", f"SAL-{yr}-0001" in out and "750,000" in out and stock("P-100")==300)
    ck("sale linked to the order", sql(f"SELECT {Q('\"orderId\"')} FROM {Q('\"StockDoc\"')} WHERE type='SELL'")==oid and onum in out)
    S.goto(B+f"/orders/{oid}"); ot=S.inner_text("main")
    ck("order page shows what was sold for it", "Sold" in ot and f"SAL-{yr}-0001" in ot)

    # 4. Output above stock: warned, allowed, minus shown
    form=stock_doc(A, B, "OUTPUT", [("P-100",400,None)], reason="DAMAGE", save=False)
    ck("output above stock warns before saving", "stock will go below zero" in form)
    A.get_by_role("button", name=re.compile("^Save output")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); out=A.inner_text("main")
    ck("…saved anyway; stock −100 and a below-zero warning", stock("P-100")==-100 and "Below zero now" in out and f"OUT-{yr}-0001" in out)
    A.goto(B+"/inventory"); inv=A.inner_text("main")
    ck("warehouse shows the minus stock and has no inputs", "-100" in inv.replace("−","-") and A.locator("main input[type=number]").count()==0)
    A.goto(B+"/inventory?tab=movements"); mv=A.inner_text("main")
    ck("movement list shows the documents", all(x in mv for x in ["Bought","Sold","Input","Output"]))

    # 5. Per-role permissions
    W=ctx(); login(W,"walid",pw["walid"]); W.goto(B+"/stock")
    ck("warehouse team: Input and Output only", W.locator("a[href='/stock/new?type=INPUT']").count()==1 and W.locator("a[href='/stock/new?type=BUY']").count()==0 and W.locator("a[href='/stock/new?type=SELL']").count()==0)
    W.goto(B+"/stock/new?type=BUY"); ck("…the form has no Buy tab", W.get_by_role("tab", name="Buy").count()==0 and W.get_by_role("tab", name="Input").count()==1)
    stock_doc(W, B, "INPUT", [("P-100",100,None)], reason="COUNT"); ck("…and can save an input (stock back to 0)", stock("P-100")==0)
    S.goto(B+"/stock"); ck("sales can view stock movements but not create", "SAL-" in S.inner_text("main") and S.locator("a[href^='/stock/new']").count()==0)
    S.goto(B+"/stock/new"); ck("…the new-document page is forbidden for them", "/forbidden" in S.url)

    # 6. Reports, export, search, audit, notifications
    day=sql("SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text")   # the factory's calendar day, as the app uses
    A.goto(B+f"/reports/trade?from={day}&to={day}"); rt=A.inner_text("main")
    ck("buying & selling report shows the totals per currency", "2,701.25" in rt and "750,000" in rt and "Gulf Polymers" in rt)
    r=A.request.get(B+f"/api/reports/trade?from={day}&to={day}"); rows=list(csv.reader(io.StringIO(r.body().decode("utf-8").lstrip("﻿"))))
    ck("trade report exports to CSV", r.status==200 and len(rows)>=4)
    A.goto(B+f"/search?q=BUY-{yr}-0001"); ck("search opens the document", "/stock/" in A.url and "Gulf Polymers" in A.inner_text("main"))
    acts=set(sql(f"SELECT DISTINCT action FROM {Q('\"AuditLog\"')}").split("\n"))
    ck("audit log has stock.buy/sell/input/output", {"stock.buy","stock.sell","stock.input","stock.output"}<=acts)
    ck("warehouse team was notified of the purchase (without money — M3)", sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='walid' AND n.type='stock.docBUYPlain'")!="0")
    W.goto(B+"/notifications"); ck("notification text is readable, with no money in it", "Purchase BUY-" in W.inner_text("main") and "USD" not in W.inner_text("main"))

    # 7. Phone + Arabic
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/stock","/stock/new?type=SELL","/inventory"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+"/stock"); ck("Arabic page opens", "حركات المخزون" in A.inner_text("main"))
    A.context.add_cookies([{"name":"bfms_locale","value":"en","url":B}])

    # 8. Go-live reset clears the documents too
    A.goto(B+"/admin?tab=system"); A.fill("#confirm","RESET"); A.fill("#reset-password",PW); A.get_by_role("button", name="Delete test transactions").click(); A.wait_for_timeout(2500)
    ck("go-live reset removes stock documents and restarts numbering", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")=="0" and sql(f"SELECT count(*) FROM {Q('\"Counter\"')} WHERE name LIKE 'stock%'")=="0")
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
