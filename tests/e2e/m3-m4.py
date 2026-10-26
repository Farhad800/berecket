"""M3 (money only for Buy / Sell / Safe roles) and M4 (temporary password blocks everything on the server).
Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/m3-m4.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
def count(t): return int(sql(f"SELECT count(*) FROM {Q(chr(34)+t+chr(34))}"))
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx():
        pg=br.new_context(viewport={"width":1366,"height":900}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    temp={}; pw={}
    for eid,name,user,role,dept in [("1001","Sara Sales","sara","Sales Manager","Sales & Planning"),("1005","Walid Warehouse","walid","Warehouse Team","Warehouse"),("1009","Tina Temp","tina","Administrator","Administration")]:
        A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId",eid); A.fill("#fullName",name); A.fill("#username",user)
        A.select_option("#roleId", label=role)
        if A.locator("#departmentId option", has_text=dept).count(): A.select_option("#departmentId", label=dept)
        A.click("form button[type=submit]"); A.wait_for_selector("text=Temporary password"); temp[user]=A.locator("code").nth(1).inner_text()
    for user in ["sara","walid"]:
        pg=ctx(); login(pg,user,temp[user]); pw[user]=f"{user.capitalize()}Factory2026"
        pg.fill("#current",temp[user]); pg.fill("#next",pw[user]); pg.fill("#confirm",pw[user]); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.context.close()
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id,'stock:sell' FROM {Q('\"Role\"')} WHERE name='Sales Manager'")
    for i,c,n,k in [("tpbowl000001","P-1","Bowl 1800","PRODUCT"),("tslabel00001","S-1","Bowl label","STICKER")]:
        sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('{i}','{c}','{n}','{k}','pcs',now())")

    # money documents: a purchase at 0.005 USD and a sale at 2,500 IQD, with phones
    stock_doc(A, B, "BUY", [("S-1",20000,"0.005")], party="Label Printer Co", currency="USD", paid=0, save=False)
    A.get_by_label("Phone", exact=True).fill("0770 111 2222"); A.get_by_role("button", name=re.compile("^Save purchase")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$"))
    buy=A.url.split("/")[-1].split("?")[0]
    stock_doc(A, B, "INPUT", [("P-1",500,None)], reason="COUNT")
    S=ctx(); login(S,"sara",pw["sara"])
    stock_doc(S, B, "SELL", [("P-1",100,"2500")], party="Al Noor Market", currency="IQD", paid=0, save=False)
    S.get_by_label("Phone", exact=True).fill("0750 999 8888"); S.get_by_role("button", name=re.compile("^Save sale")).click(); S.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$"))
    sell=S.url.split("/")[-1].split("?")[0]

    # ── M3: the warehouse team (no Buy / Sell / Safe) sees quantities only
    W=ctx(); login(W,"walid",pw["walid"])
    W.goto(B+"/stock"); txt=W.inner_text("main"); raw=W.content()
    ck("warehouse: stock list shows the documents but no totals", "BUY-" in txt and "SAL-" in txt and "100 USD" not in txt and "250,000 IQD" not in txt)
    W.goto(B+f"/stock/{buy}"); txt=W.inner_text("main"); raw=W.content()
    ck("warehouse: purchase page shows quantities but no price, total or payments", "20,000" in txt and "0.005" not in txt and "Price" not in txt and "Payment to the supplier" not in txt and "Still owed" not in txt)
    ck("warehouse: …and the price / phone aren't even in the page data sent to the browser", "0.005" not in raw and "0770 111 2222" not in raw and '"unitPrice"' not in raw)
    ck("warehouse: no Print receipt button", W.get_by_role("link", name="Print receipt").count()==0)
    ck("warehouse: the receipt address itself is refused", W.request.get(B+f"/print/receipt/doc/{buy}").status==404 or "could not be found" in W.request.get(B+f"/print/receipt/doc/{buy}").text().lower())
    W.goto(B+f"/print/receipt/doc/{sell}"); ck("warehouse: sale receipt page shows nothing of the sale", "Al Noor" not in W.content() and "2,500" not in W.content())
    W.goto(B+"/reports"); ck("warehouse: Buying and selling report not listed", "Buying and selling" not in W.inner_text("main"))
    W.goto(B+"/reports/trade"); ck("warehouse: the report page is refused", "Gulf" not in W.content() and "Label Printer Co" not in W.content() and W.locator("table").count()==0)
    ck("warehouse: its CSV is refused", W.request.get(B+"/api/reports/trade").status in (403,404))
    # even with export rights, the money rule still refuses the CSV and the PDF
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id,'reports:export' FROM {Q('\"Role\"')} WHERE name='Warehouse Team' ON CONFLICT DO NOTHING")
    ck("warehouse + export rights: money CSV still refused, other reports still export", W.request.get(B+"/api/reports/trade").status==404 and W.request.get(B+"/api/reports/production").status==200)
    W.goto(B+"/print/reports/trade"); ck("warehouse + export rights: money PDF page refused", "Label Printer Co" not in W.content() and W.locator("table").count()==0)
    n_money=sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='walid' AND n.type IN ('stock.docBUY','stock.docSELL')")
    n_plain=sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='walid' AND n.type IN ('stock.docBUYPlain','stock.docSELLPlain')")
    leak=sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='walid' AND (n.title||coalesce(n.body,'')||coalesce(n.data::text,'')) ~ '(USD|IQD|Label Printer|Al Noor)'")
    ck(f"warehouse: told about the purchase and the sale without money (money {n_money}, plain {n_plain}, leaking {leak})", n_money=="0" and n_plain=="2" and leak=="0")
    W.goto(B+"/notifications"); ck("warehouse: notification reads 'Purchase BUY-…: 1 items'", "Purchase BUY-" in W.inner_text("main") and "USD" not in W.inner_text("main"))
    W.goto(B+"/stock/new?type=INPUT"); ck("warehouse: new-document page doesn't carry customer names or phones", "Al Noor" not in W.content() and "0750 999 8888" not in W.content())

    # ── M3: the sales manager (may Sell) and the owner see the money
    S.goto(B+f"/stock/{sell}"); txt=S.inner_text("main")
    ck("sales (Sell): sees prices, total, still owed and the phone", "2,500" in txt and "250,000 IQD" in txt and "Still owed" in txt and "0750 999 8888" in txt)
    ck("sales (Sell): can print the receipt", S.request.get(B+f"/print/receipt/doc/{sell}").status==200 and "250,000" in S.request.get(B+f"/print/receipt/doc/{sell}").text())
    S.goto(B+"/reports/trade"); ck("sales (Sell): sees the Buying and selling report", "Al Noor Market" in S.inner_text("main"))
    ck("sales (Sell): got the money version of the purchase notice", sql(f"SELECT count(*) FROM {Q('\"Notification\"')} n JOIN {Q('\"User\"')} u ON u.id=n.{Q('\"userId\"')} WHERE u.username='sara' AND n.type='stock.docBUY'")=="1")
    A.goto(B+f"/stock/{buy}"); ck("owner: sees price 0.005 and total 100 USD", "0.005" in A.inner_text("main") and "100 USD" in A.inner_text("main"))

    # ── M4: an Administrator who hasn't changed the temporary password can do nothing on the server
    def capture(page, start, finish):
        cap={}
        def grab(route, req):
            if req.method=="POST" and req.headers.get("next-action"): cap.update(h=req.headers, body=req.post_data_buffer, url=req.url); route.abort()
            else: route.continue_()
        page.route("**/*", grab); start(); finish(); page.wait_for_timeout(1500); page.unroute("**/*")
        return {"url":cap["url"], "headers":{**{k:v for k,v in cap["h"].items() if k.lower() in ("next-action","content-type","accept","next-router-state-tree")}, "origin":B}, "body":cap["body"]}
    reqs={}
    reqs["stock input"]=capture(A, lambda: stock_doc(A, B, "INPUT", [("P-1",7,None)], reason="COUNT", save=False), lambda: A.get_by_role("button", name=re.compile("^Save input")).click())
    def cash_fill():
        A.goto(B+"/cash/new?type=IN"); A.get_by_label("Amount", exact=True).fill("5000"); A.get_by_label("Note").fill("probe")
    reqs["money in"]=capture(A, cash_fill, lambda: A.get_by_role("button", name=re.compile("^Save money in")).click())
    def daily_fill():
        A.goto(B+"/production/daily?shift=A"); A.wait_for_load_state("networkidle")
        if A.locator("text=Only products in open orders").count(): A.uncheck("text=Only products in open orders")
        A.fill("input[name='qty_tpbowl000001']","9")
    reqs["daily production"]=capture(A, daily_fill, lambda: A.get_by_role("button", name=re.compile("Save")).last.click())
    def emp_fill():
        A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId","7777"); A.fill("#fullName","Ghost"); A.fill("#username","ghost"); A.select_option("#roleId", label="Administrator")
    reqs["new employee"]=capture(A, emp_fill, lambda: A.click("form button[type=submit]"))
    T=ctx(); login(T,"tina",temp["tina"])
    ck("temp password: signing in lands on Change password", T.url.endswith("/change-password"))
    before=(count("StockDoc"), count("CashEntry"), count("ProductionEntry"), count("User"))
    blocked=[]
    for name,r in reqs.items():
        resp=T.context.request.post(r["url"], headers=r["headers"], data=r["body"]); body=resp.text()
        if "Change your temporary password first" in body: blocked.append(name)
    after=(count("StockDoc"), count("CashEntry"), count("ProductionEntry"), count("User"))
    ck(f"temp password: stock input, money in, production and new employee all refused ({blocked})", len(blocked)==4)
    ck(f"temp password: nothing was saved ({before} → {after})", before==after)
    api={u: T.context.request.get(B+u).status for u in ["/api/reports/production","/api/audit","/api/import/template"]}
    ck(f"temp password: downloads refused ({api})", all(s==403 for s in api.values()))
    T.goto(B+"/stock"); ck("temp password: pages still send to Change password", T.url.endswith("/change-password"))
    # language switch and the password change itself still work
    T.goto(B+"/change-password"); T.fill("#current",temp["tina"]); T.fill("#next","TinaFactory2026"); T.fill("#confirm","TinaFactory2026"); T.click("button[type=submit]"); T.wait_for_url("**/dashboard", wait_until="commit")
    ck("temp password: changing it works", sql(f"SELECT {Q('\"mustChangePassword\"')} FROM {Q('\"User\"')} WHERE username='tina'")=="f")
    r=reqs["stock input"]; resp=T.context.request.post(r["url"], headers=r["headers"], data=r["body"])
    ck("after changing it: the same stock input now works (block was the temporary password, not permissions)", count("StockDoc")==before[0]+1)
    ck("after changing it: downloads work", T.context.request.get(B+"/api/reports/production").status==200)
    # an administrator resets someone's password → that person is blocked again
    A.goto(B+"/admin?tab=employees"); sql(f"UPDATE {Q('\"User\"')} SET {Q('\"mustChangePassword\"')}=true WHERE username='walid'")
    W.goto(B+"/stock"); ck("password reset by admin: open sessions are sent to Change password too", W.url.endswith("/change-password"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
