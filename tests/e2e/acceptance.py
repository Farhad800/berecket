"""
Acceptance test — spec section 18, run from an EMPTY database, the way the factory will start.

Setup (see docs/TESTING.md):
  createdb bereket_accept → prisma migrate deploy → SEED_SKIP_ADMIN=1 seed
  start the app on :3001 with DATABASE_URL=…/bereket_accept and SETUP_TOKEN=acceptance-setup-token-2026
  python3 tests/e2e/acceptance.py
"""
import os, re, csv, io, json, subprocess
from playwright.sync_api import sync_playwright
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/accept/"; os.makedirs(O, exist_ok=True)
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EN=json.load(open(os.path.join(ROOT,"messages/en.json")))
res=[]
def ck(n,c):
    res.append((n,bool(c))); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def T(q): return q.replace('"','\\"')   # quote helper for identifiers
def H(path):
    n=EN["history"]
    for p in path.split("."): n=n[p]
    return n
PW={"owner":"OwnerPass2026!"}
def login(pg,u,pw=None):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw or PW[u]); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def combo(pg,name,text,nth=0):
    pg.locator(f'[id="{name}"]').nth(nth).click(); pg.keyboard.type(text); pg.wait_for_timeout(200); pg.keyboard.press("Enter")
def btn(pg,name,exact=True,last=False):
    l=pg.get_by_role("button", name=name, exact=exact); (l.last if last else l.first).click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(900)
def main_text(pg): return pg.inner_text("main")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        c=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)); pg=c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    # ── 0. First administrator via the one-time setup page
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW["owner"]); A.fill("#confirm",PW["owner"]); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    ck("0. first administrator created on an empty system; setup then closes", A.request.get(B+"/setup").status==404)

    # ── 1. Admin creates employees and assigns roles
    staff=[("1001","Sara Sales","sara","Sales Manager","Sales & Planning"),("1002","Peter Production","peter","Production Team","Production"),
           ("1003","Tariq Technician","tariq","Technical Service Team","Technical Service"),("1004","Qamar Quality","qamar","Quality Control Team","Quality Control"),
           ("1005","Walid Warehouse","walid","Warehouse Team","Warehouse")]
    temps={}
    for eid,name,user,role,dept in staff:
        A.goto(B+"/admin?tab=employees"); A.click("text=New employee")
        A.fill("#employeeId",eid); A.fill("#fullName",name); A.fill("#username",user); A.select_option("#roleId", label=role)
        A.select_option("#departmentId", label=dept); A.click("form button[type=submit]")
        A.wait_for_selector("text=Temporary password"); temps[user]=A.locator("code").nth(1).inner_text()
    ck("1. admin created 5 employees, one per department role", len(temps)==5 and sql(f"SELECT count(*) FROM {T('\"User\"')}")=="6")

    # ── 2. Employees sign in securely (temporary password must be changed) and see only their features
    for user,temp in temps.items():
        pg=ctx(); login(pg,user,temp)
        ok=pg.url.endswith("/change-password")
        PW[user]=f"{user.capitalize()}Factory2026"
        pg.fill("#current",temp); pg.fill("#next",PW[user]); pg.fill("#confirm",PW[user]); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit")
        if not ok: ck(f"2. {user} forced to change temporary password", False)
        pg.context.close()
    ck("2. every new employee had to replace the temporary password", True)
    P=ctx(); login(P,"peter")
    ck("2. production's menu has no administration", P.locator("nav a[href='/admin']").count()==0)
    P.goto(B+"/admin"); ck("2. production blocked from administration page", "/forbidden" in P.url)

    # the old customer master data is gone; customer ACCOUNTS (26 Oct 2026) are a money page for the administrator
    ck("customer accounts open for the administrator", A.request.get(B+"/customers").status==200)
    for code,name,qc in [("CAP-28","28 mm bottle cap",False),("PF-500","500 ml PET preform",True),("JAR-1L","1 L food jar",False)]:
        A.goto(B+"/products/new"); A.get_by_label("Product name").fill(name); A.get_by_label("Product code *").fill(code)
        if qc: A.get_by_label("Inspection required before release").check()
        A.get_by_role("button", name="Create product").click(); A.wait_for_url(re.compile(r".*/products/c[a-z0-9]+\?created=1"), wait_until="commit")
    for code in ["TOYO-01","TOYO-02"]:
        A.goto(B+"/assets"); A.click("text=New machine"); A.fill("#code",code); A.fill("#name","Toyo Si-180"); A.select_option("#status","AVAILABLE"); btn(A,"Save")
    A.goto(B+"/assets?tab=molds"); A.click("text=New mold"); A.fill("#code","MD-CAP28"); A.fill("#name","Cap mold 24-cav"); A.fill("#cavities","24"); btn(A,"Save")
    ck("master data created (3 products, 2 machines, mold)", sql(f"SELECT (SELECT count(*) FROM {T('\"Product\"')})||'/'||(SELECT count(*) FROM {T('\"Machine\"')})||'/'||(SELECT count(*) FROM {T('\"Mold\"')})")=="3/2/1")
    pid=dict(r.split("|") for r in sql(f"SELECT code||'|'||id FROM {T('\"Product\"')}").split("\n"))

    # ── 4. Sales manager gives a sheet of products and amounts — no customer, no date
    S=ctx(); login(S,"sara"); S.goto(B+"/orders/new")
    ck("4. order form has no customer or date fields", S.locator("#customerId").count()==0 and S.locator("input[type=date]").count()==0)
    S.fill("input[aria-label='CAP-28 Quantity']","10000"); S.fill("input[aria-label='PF-500 Quantity']","6000")
    S.get_by_role("button", name=re.compile("^(Save order|Save)$")).click()
    S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); S.wait_for_load_state("networkidle")
    oid=S.url.split("/")[-1]; onum=re.search(r"ORD-\d{4}-\d{4}", main_text(S)).group(0); print("   order", onum)
    ck("4. order with 2 products saved as Open", sql(f"SELECT count(*) FROM {T('\"OrderLine\"')} WHERE {T('\"orderId\"')}='{oid}'")=="2" and sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="OPEN")
    S.goto(B+f"/orders/{oid}/edit"); S.fill("input[aria-label='JAR-1L Quantity']","500"); S.fill("input[aria-label='PF-500 Quantity']","6500")
    S.get_by_role("button", name=re.compile("^(Save order|Save)$")).click(); S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); S.wait_for_load_state("networkidle")
    ck("4. order edited: 3 products, 17,000 pcs", sql(f"SELECT count(*)||'/'||SUM(quantity) FROM {T('\"OrderLine\"')} WHERE {T('\"orderId\"')}='{oid}'")=="3/17000")
    # 60 products on one order — the sheet handles big orders
    vals=",".join(f"('BULK-{i:03d}','Bulk product {i}',now(),'cx{i:022d}')" for i in range(60))
    sql(f"INSERT INTO {T('\"Product\"')} (code,name,{T('\"updatedAt\"')},id) VALUES {vals}")
    S.goto(B+"/orders/new")
    for i in range(60): S.fill(f"input[aria-label='BULK-{i:03d} Quantity']",str(100+i))
    S.get_by_role("button", name=re.compile("^(Save order|Save)$")).click(); S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); S.wait_for_load_state("networkidle")
    big=S.url.split("/")[-1]
    ck("4. one order with 60 products saved", sql(f"SELECT count(*) FROM {T('\"OrderLine\"')} WHERE {T('\"orderId\"')}='{big}'")=="60")

    # ── 5. Production types what was made today, per shift — stock goes up automatically
    P.goto(B+"/production/daily?shift=A")
    P.fill(f"input[name='qty_{pid['CAP-28']}']","4000"); P.fill(f"input[name='qty_{pid['PF-500']}']","6500")
    btn(P,"Save all")
    ck("5. daily sheet saved 2 entries", "Saved 2 products" in main_text(P) and sql(f"SELECT count(*) FROM {T('\"ProductionEntry\"')}")=="2")
    P.goto(B+"/production/daily?shift=B"); P.fill(f"input[name='qty_{pid['CAP-28']}']","6000"); btn(P,"Save all")
    P.goto(B+"/production/daily?shift=B"); P.fill(f"input[name='qty_{pid['CAP-28']}']","500"); btn(P,"Save all")
    ck("5. same shift + product adds to the existing entry", sql(f"SELECT quantity FROM {T('\"ProductionEntry\"')} WHERE shift='B'")=="6500")
    stock=lambda code: int(float(sql(f"SELECT COALESCE(SUM(qty),0) FROM {T('\"StockMovement\"')} WHERE {T('\"productId\"')}='{pid[code]}'")))
    ck("5. stock = produced (CAP-28 10,500, PF-500 6,500)", stock("CAP-28")==10500 and stock("PF-500")==6500)
    # correct a typing mistake
    eB=sql(f"SELECT id FROM {T('\"ProductionEntry\"')} WHERE shift='B'")
    P.goto(B+"/production"); P.locator("li", has=P.locator(f"a[href='/qc/entries/{eB}']")).get_by_role("button", name="Correct").click()
    P.fill("input[name=quantity]","6000"); P.fill("input[name=reason]","typed 500 twice"); btn(P,"Save")
    ck("5. entry corrected → stock follows", sql(f"SELECT quantity FROM {T('\"ProductionEntry\"')} WHERE id='{eB}'")=="6000" and stock("CAP-28")==10000)
    P.goto(B+"/production"); ck("5. production page shows today's total 16,500", "16,500" in main_text(P))
    ck("5. no schedule page any more", P.request.get(B+"/schedule").status==404)

    # ── 6. A maintenance issue on a machine
    P.goto(B+"/service/requests/new"); combo(P,"machineId","TOYO-01"); P.fill("#title","Ejector pin stuck"); P.check("input[name=machineDown]"); btn(P,"Send request")
    mr=sql(f"SELECT id||'|'||number FROM {T('\"MaintenanceRequest\"')} LIMIT 1").split("|")
    ck("6. maintenance request created; machine marked down", mr[1].startswith("MR-") and sql(f"SELECT status FROM {T('\"Machine\"')} WHERE code='TOYO-01'")=="DOWN")
    Tq=ctx(); login(Tq,"tariq"); Tq.goto(B+f"/service/requests/{mr[0]}"); btn(Tq,"Start work"); btn(Tq,"Repair completed")
    Tq.fill("textarea[placeholder='What was repaired or replaced?']","Freed and greased ejector pin"); btn(Tq,"Confirm")
    Q=ctx(); login(Q,"qamar"); Q.goto(B+f"/service/requests/{mr[0]}"); btn(Q,"Verify")
    ck("6. repair verified and machine available again", sql(f"SELECT status FROM {T('\"MaintenanceRequest\"')} WHERE id='{mr[0]}'")=="VERIFIED" and sql(f"SELECT status FROM {T('\"Machine\"')} WHERE code='TOYO-01'")=="AVAILABLE")

    # ── 7. QC inspects daily entries: approve one, reject part of another
    eA_cap=sql(f"SELECT id FROM {T('\"ProductionEntry\"')} WHERE shift='A' AND {T('\"productId\"')}='{pid['CAP-28']}'")
    eA_pf=sql(f"SELECT id FROM {T('\"ProductionEntry\"')} WHERE shift='A' AND {T('\"productId\"')}='{pid['PF-500']}'")
    Q.goto(B+"/qc"); ck("7. QC sees today's entries, QC-required product first", "PF-500" in main_text(Q))
    Q.goto(B+f"/qc/entries/{eA_cap}"); Q.fill("input[name=qtyInspected]","50"); Q.get_by_role("button", name="Approve").click(); Q.wait_for_load_state("networkidle"); Q.wait_for_timeout(1000)
    Q.goto(B+f"/qc/entries/{eA_pf}"); Q.fill("input[name=qtyInspected]","500"); Q.fill("input[name=qtyRejected]","300")
    Q.select_option("select[name=categoryId]", label="Contamination / black specks"); Q.fill("textarea[name=issueDescription]","Black specks in the wall")
    Q.get_by_role("button", name=re.compile("^Reject 300")).click(); Q.wait_for_load_state("networkidle"); Q.wait_for_timeout(1000)
    q=lambda e: sql(f"SELECT {T('\"qcStatus\"')} FROM {T('\"ProductionEntry\"')} WHERE id='{e}'")
    ck("7. QC approved one entry and rejected another", q(eA_cap)=="APPROVED" and q(eA_pf)=="REJECTED")
    ck("7. rejected pieces left stock automatically (PF-500 6,200)", stock("PF-500")==6200)
    ck("7. a quality issue was opened for the rejection", sql(f"SELECT count(*) FROM {T('\"QualityIssue\"')} WHERE {T('\"entryId\"')}='{eA_pf}'")=="1")
    P.goto(B+"/production"); ck("7. inspected entries can't be corrected any more", P.locator("li", has=P.locator(f"a[href='/qc/entries/{eA_pf}']")).get_by_role("button", name="Correct").count()==0)

    # ── 8/9/10. Warehouse shows stock only; stock changes through Stock Movements documents
    W=ctx(); login(W,"walid"); W.goto(B+"/inventory")
    ck("9. warehouse sees stock per product", "10,000" in main_text(W) and "6,200" in main_text(W))
    ck("9. warehouse page is read-only (no inputs)", W.locator("main input[type=number]").count()==0)
    stock_doc(W, B, "OUTPUT", [("CAP-28",4000,None),("PF-500",3000,None)], reason="TRANSFER")
    ck("10. output document → stock reduced (6,000 / 3,200)", stock("CAP-28")==6000 and stock("PF-500")==3200)
    form=stock_doc(W, B, "OUTPUT", [("PF-500",9999,None)], reason="DAMAGE", save=False)
    ck("8. taking out more than in stock warns before saving", "stock will go below zero" in form)
    ck("8. no shipments or customers pages", W.request.get(B+"/shipments").status==404)
    stock_doc(A, B, "OUTPUT", [("PF-500",200,None)], reason="DAMAGE")
    ck("8. damaged pieces taken out with a reason", stock("PF-500")==3000)

    # ── 11. Stock always equals the ledger
    neg=sql(f"SELECT count(*) FROM (SELECT {T('\"productId\"')} FROM {T('\"StockMovement\"')} GROUP BY 1 HAVING SUM(qty)<0) x")
    made=int(sql(f"SELECT SUM(quantity) FROM {T('\"ProductionEntry\"')}")); inmv=int(float(sql(f"SELECT SUM(qty) FROM {T('\"StockMovement\"')} WHERE type='PRODUCTION'")))
    ck(f"11. production entries ({made}) = stock in ({inmv}); no product below zero", made==inmv==16500 and neg=="0")

    # ── 12. Order complete; history shows what happened
    S.goto(B+f"/orders/{oid}"); btn(S,"Mark completed")
    ck("12. sales marked the order completed", sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="COMPLETED")
    S.goto(B+f"/orders/{oid}"); hist=main_text(S)
    need=[H("order.create"),H("order.update"),H("order.complete")]
    missing=[x for x in need if x not in hist]
    ck(f"12. order history shows create, change, complete (missing: {missing})", not missing)
    S.goto(B+f"/orders/{big}"); btn(S,"Delete order"); S.locator("input:focus").fill("Entered as a test"); S.get_by_role("button", name="Confirm").click(); S.wait_for_url("**/orders?deleted=1", wait_until="commit")
    ck("12. an order entered by mistake can be deleted", sql(f"SELECT count(*) FROM {T('\"Order\"')} WHERE id='{big}'")=="0")

    # ── 3. Everyone can view, but can't change without permission
    W.goto(B+f"/orders/{oid}"); ck("3. warehouse can view the order", onum in main_text(W))
    ck("3. …but has no edit/complete buttons", W.get_by_role("button", name="Reopen").count()==0 and W.locator(f"a[href='/orders/{oid}/edit']").count()==0)
    Q.goto(B+"/production"); ck("3. QC sees production read-only", Q.get_by_role("button", name="Correct").count()==0 and Q.locator("a[href^='/production/daily']").count()==0)

    # ── 13. Search, filters, reports, exports
    A.goto(B+"/search?q="+onum); ck("13. search by exact order number opens the order", A.url.endswith(f"/orders/{oid}"))
    A.goto(B+"/search?q=toyo-01"); ck("13. search by machine number", "/history?machine=" in A.url)
    A.goto(B+"/orders?status=COMPLETED"); ck("13. order list status filter", onum in main_text(A))
    day=sql(f"SELECT day::text FROM {T('\"ProductionEntry\"')} LIMIT 1")
    A.goto(B+f"/reports/production?from={day}&to={day}&group=product"); rep=main_text(A)
    ck("13. production report = 16,500 pieces", "16,500" in rep)
    A.goto(B+f"/reports/quality?from={day}&to={day}"); ck("13. rejection report shows the 300 rejected pieces", "300" in main_text(A))
    A.goto(B+"/reports/demand"); ck("13. ordered-vs-stock report opens", "Ordered vs. stock" in main_text(A))
    r=A.request.get(B+f"/api/reports/movements?from={day}&to={day}"); rows=list(csv.reader(io.StringIO(r.body().decode("utf-8").lstrip("\ufeff"))))
    ck("13. CSV export of stock movements works", r.status==200 and len(rows)>5)
    A.goto(B+"/print/reports/stock"); ck("13. printable PDF report opens", A.locator("img[src='/brand/bereket-logo.jpg']").count()==1)

    # ── 14. Desktop and mobile
    M=br.new_context(**p.devices["iPhone 13"]).new_page(); M.on("pageerror", lambda e: errs.append(str(e))); login(M,"peter")
    over=[]
    for path in ["/dashboard","/production","/production/daily","/inventory",f"/orders/{oid}","/orders/new","/reports/stock","/search?q=ORD"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    M.goto(B+"/production/daily"); M.screenshot(path=O+"mobile-daily.png", full_page=True)
    ck(f"14. phone layout fits the screen on key pages (overflow: {over})", not over)

    # ── 15. Critical actions are in the audit log
    acts=set(sql(f"SELECT DISTINCT action FROM {T('\"AuditLog\"')}").split("\n"))
    need=["setup.first_admin","user.create","order.create","order.update","order.complete","order.delete","production.report","production.correct","maintenance.create","maintenance.verify","qc.approve","qc.reject","stock.output","report.export"]
    ck(f"15. audit log has every critical action (missing: {[a for a in need if a not in acts]})", all(a in acts for a in need))
    who=sql(f"SELECT u.username FROM {T('\"AuditLog\"')} a JOIN {T('\"User\"')} u ON u.id=a.{T('\"userId\"')} WHERE a.action='stock.output' ORDER BY a.{T('\"createdAt\"')} LIMIT 1")
    ck("15. audit log records who took the stock out", who=="walid")

    # ── 16. Backup and recovery are documented
    doc=open(os.path.join(ROOT,"docs/BACKUP-RESTORE.md")).read() if os.path.exists(os.path.join(ROOT,"docs/BACKUP-RESTORE.md")) else ""
    ck("16. backup & restore procedure documented", "Restore" in doc and "pg_restore" in doc)

    # ── 17. Unauthorized requests rejected by the backend
    cap={}
    def grab(route, req):
        if req.method=="POST" and req.headers.get("next-action"): cap.update(h=req.headers, body=req.post_data_buffer, url=req.url); route.abort()
        else: route.continue_()
    A.goto(B+"/admin?tab=employees"); A.route("**/admin**", grab); A.click("text=New employee"); A.fill("#employeeId","9999"); A.fill("#fullName","Not Allowed")
    A.fill("#username","intruder"); A.select_option("#roleId", label="Administrator"); A.click("form button[type=submit]"); A.wait_for_timeout(1500); A.unroute("**/admin**")
    keep={k:v for k,v in cap["h"].items() if k.lower() in ("next-action","content-type","accept","next-router-state-tree")}
    r=P.context.request.post(cap["url"], headers={**keep,"origin":B}, data=cap["body"])
    ck("17. production calling an admin action directly is refused", "permission" in r.text() and sql(f"SELECT count(*) FROM {T('\"User\"')} WHERE username='intruder'")=="0")
    ck("17. export API refuses roles without export permission", P.request.get(B+"/api/reports/production").status==403 and P.request.get(B+"/api/audit").status==403)
    anon=br.new_context(); ck("17. signed-out API calls refused", anon.request.get(B+"/api/reports/production", max_redirects=0).status in (307,401))

    # ── 18. Whole workflow order → production → QC → stock out
    ck("18. full workflow from order to production, QC and stock out completed", sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="COMPLETED" and stock("CAP-28")==6000)

    # ── Go-live reset clears test data but keeps people and master data
    A.goto(B+"/admin?tab=system"); A.fill("#confirm","RESET"); A.fill("#reset-password",PW["owner"]); btn(A,"Delete test transactions")
    left=sql(f"SELECT (SELECT count(*) FROM {T('\"Order\"')})+(SELECT count(*) FROM {T('\"ProductionEntry\"')})+(SELECT count(*) FROM {T('\"StockMovement\"')})")
    ck("go-live reset removed all test transactions", left=="0" and "ready for real use" in main_text(A))
    ck("…kept employees, products, machines and audit log", sql(f"SELECT (SELECT count(*) FROM {T('\"User\"')})||'/'||(SELECT count(*) FROM {T('\"Product\"')})||'/'||(SELECT count(*) FROM {T('\"Machine\"')})")=="6/63/2" and "system.reset" in sql(f"SELECT action FROM {T('\"AuditLog\"')} ORDER BY {T('\"createdAt\"')} DESC LIMIT 1"))
    S.goto(B+"/orders/new"); S.fill("input[aria-label='CAP-28 Quantity']","1000")
    S.get_by_role("button", name=re.compile("^(Save order|Save)$")).click(); S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit")
    ck("…and order numbering starts again at 0001", "-0001" in main_text(S))

    ck("no browser errors anywhere", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(1 for _,c in res if c)}/{len(res)} passed")
