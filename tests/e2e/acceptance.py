"""
Acceptance test — spec section 18, run from an EMPTY database, the way the factory will start.

Setup (see docs/TESTING.md):
  createdb bereket_accept → prisma migrate deploy → SEED_SKIP_ADMIN=1 seed
  start the app on :3001 with DATABASE_URL=…/bereket_accept and SETUP_TOKEN=acceptance-setup-token-2026
  python3 tests/e2e/acceptance.py
"""
import os, re, csv, io, json, subprocess
from playwright.sync_api import sync_playwright
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
def bal(bid):
    rows=sql(f"SELECT state||'='||SUM(qty) FROM {T('\"StockMovement\"')} WHERE {T('\"batchId\"')}='{bid}' GROUP BY state")
    return {k:int(v) for k,v in (r.split("=") for r in rows.split("\n") if r)}

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

    # master data (admin)
    A.goto(B+"/customers"); A.click("text=New customer"); A.fill("#name","Zakho Water Company"); A.fill("#phone","0750 123 4567"); btn(A,"Save")
    for code,name,qc in [("CAP-28","28 mm bottle cap",False),("PF-500","500 ml PET preform",True)]:
        A.goto(B+"/products"); A.click("text=New product"); A.fill("#code",code); A.fill("#name",name); A.fill("#cycleTimeSec","8")
        if qc: A.check("input[name=qcRequired]")
        btn(A,"Save")
    for code in ["TOYO-01","TOYO-02"]:
        A.goto(B+"/assets"); A.click("text=New machine"); A.fill("#code",code); A.fill("#name","Toyo Si-180"); A.select_option("#status","AVAILABLE"); btn(A,"Save")
    A.goto(B+"/assets?tab=molds"); A.click("text=New mold"); A.fill("#code","MD-CAP28"); A.fill("#name","Cap mold 24-cav"); A.fill("#cavities","24"); combo(A,"productId","CAP-28"); btn(A,"Save")
    ck("master data created (customer, 2 products, 2 machines, mold)", sql(f"SELECT (SELECT count(*) FROM {T('\"Customer\"')})||'/'||(SELECT count(*) FROM {T('\"Product\"')})||'/'||(SELECT count(*) FROM {T('\"Machine\"')})||'/'||(SELECT count(*) FROM {T('\"Mold\"')})")=="1/2/2/1")

    # ── 4. Sales creates an order with several products
    S=ctx(); login(S,"sara"); S.goto(B+"/orders/new")
    combo(S,"customerId","Zakho Water"); S.fill("#requestedDeliveryDate","2026-11-10"); S.select_option("#priority","HIGH")
    combo(S,"productId[]","CAP-28",0); S.locator('input[name="quantity[]"]').nth(0).fill("10000")
    S.click("text=Add product"); combo(S,"productId[]","PF-500",1); S.locator('input[name="quantity[]"]').nth(1).fill("6000")
    S.fill("#packaging","Cartons of 1,000, pallet-wrapped"); btn(S,"Save & confirm")
    S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); S.wait_for_load_state("networkidle")
    oid=S.url.split("/")[-1]; onum=re.search(r"ORD-\d{4}-\d{4}", main_text(S)).group(0); print("   order", onum)
    ck("4. sales order with 2 products created and confirmed", sql(f"SELECT count(*) FROM {T('\"OrderLine\"')} WHERE {T('\"orderId\"')}='{oid}'")=="2" and onum.endswith("-0001"))

    # ── 5. Production is scheduled and reports partial production
    def schedule(line_text, machine, start, end, qty, mold=None):
        S.goto(B+"/schedule?view=week&date=2026-10-22&new=1"); combo(S,"orderLineId",line_text); combo(S,"machineId",machine)
        if mold: combo(S,"moldId",mold)
        S.fill("#plannedStart",start); S.fill("#plannedEnd",end); S.fill("#plannedQty",qty); btn(S,"Schedule")
        if S.locator("input[name=acknowledge]").count(): S.check("input[name=acknowledge]"); btn(S,"Save with these issues")
    schedule(f"{onum} · 28","TOYO-01","2026-10-22T07:00","2026-10-23T07:00","10000","MD-CAP28")
    schedule(f"{onum} · 500","TOYO-02","2026-10-22T07:00","2026-10-23T07:00","6000")
    jobs=dict(r.split("|") for r in sql(f"SELECT p.code||'|'||j.id FROM {T('\"ProductionJob\"')} j JOIN {T('\"OrderLine\"')} l ON l.id=j.{T('\"orderLineId\"')} JOIN {T('\"Product\"')} p ON p.id=l.{T('\"productId\"')} WHERE l.{T('\"orderId\"')}='{oid}'").split("\n"))
    ck("5. both order lines scheduled on machines", len(jobs)==2 and sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="SCHEDULED")
    j1,j2=jobs["CAP-28"],jobs["PF-500"]
    P.goto(B+f"/production/{j1}"); btn(P,"Start job"); P.fill("#qtyGood","4000"); P.fill("#qtyDefective","35"); btn(P,"Add quantity")
    ck("5. partial production reported (4,000 of 10,000)", "4,000 of 10,000" in main_text(P) and sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="IN_PRODUCTION")

    # ── 6. A maintenance issue linked to the machine and the job
    btn(P,"Pause"); P.select_option("#category","BREAKDOWN"); P.fill("#reason","Ejector pin stuck"); P.check("input[name=machineDown]"); btn(P,"Pause job")
    mr=sql(f"SELECT id||'|'||number||'|'||{T('\"machineId\"')} FROM {T('\"MaintenanceRequest\"')} WHERE {T('\"jobId\"')}='{j1}'").split("|")
    mach1=sql(f"SELECT {T('\"machineId\"')} FROM {T('\"ProductionJob\"')} WHERE id='{j1}'")
    ck("6. maintenance request linked to machine and production job", mr[1].startswith("MR-") and mr[2]==mach1)
    Tq=ctx(); login(Tq,"tariq"); Tq.goto(B+f"/service/requests/{mr[0]}"); btn(Tq,"Start work"); btn(Tq,"Repair completed")
    Tq.fill("textarea[placeholder='What was repaired or replaced?']","Freed and greased ejector pin"); btn(Tq,"Confirm")
    Q=ctx(); login(Q,"qamar"); Q.goto(B+f"/service/requests/{mr[0]}"); btn(Q,"Verify")
    P.goto(B+f"/production/{j1}"); btn(P,"Resume"); btn(P,"New batch"); P.fill("#qtyGood","6000"); btn(P,"Add quantity")
    btn(P,"Complete job"); P.get_by_role("button", name="Complete job").last.click(); P.wait_for_timeout(1200)
    P.goto(B+f"/production/{j2}"); btn(P,"Start job"); P.fill("#qtyGood","6000"); btn(P,"Add quantity"); btn(P,"New batch"); P.fill("#qtyGood","500"); btn(P,"Add quantity")
    btn(P,"Complete job"); P.get_by_role("button", name="Complete job").last.click(); P.wait_for_timeout(1200)
    b=lambda j: [r.split("|") for r in sql(f"SELECT id||'|'||number FROM {T('\"Batch\"')} WHERE {T('\"jobId\"')}='{j}' ORDER BY {T('\"createdAt\"')}").split("\n")]
    (c1,c1n),(c2,c2n)=b(j1); (p1,p1n),(p2,p2n)=b(j2)
    ck("6. repair verified, job resumed and both jobs completed", sql(f"SELECT string_agg(status::text,',') FROM {T('\"ProductionJob\"')} WHERE id IN ('{j1}','{j2}')")=="COMPLETED,COMPLETED")
    ck("   preform batches wait for QC (product requires QC)", sql(f"SELECT string_agg({T('\"qcStatus\"')}::text,',' ORDER BY {T('\"createdAt\"')}) FROM {T('\"Batch\"')} WHERE {T('\"jobId\"')}='{j2}'")=="PENDING,PENDING")

    # ── 7. QC holds one batch and rejects another; approves the rest
    def inspect(batch, decision, insp, acc, rej=0, desc=None, cat="Incorrect dimensions"):
        Q.goto(B+f"/qc/batches/{batch}"); Q.check(f"input[value={decision}]", force=True); Q.fill("#qtyInspected",str(insp)); Q.fill("#qtyAccepted",str(acc))
        if rej: Q.fill("#qtyRejected",str(rej))
        if desc and Q.locator("#categoryId").count(): Q.select_option("#categoryId", label=cat); Q.fill("#issueDescription",desc)
        label={"APPROVE":"Approve","HOLD":"Hold","REJECT":"Reject","PARTIAL":"Partial"}[decision]
        Q.get_by_role("button", name=re.compile(f"^Save — {label}")).click(); Q.wait_for_load_state("networkidle"); Q.wait_for_timeout(1000)
    inspect(c2,"HOLD",50,44,6,"Cap thread incomplete on 6 of 50")
    inspect(p1,"APPROVE",80,80)
    inspect(p2,"REJECT",40,10,30,"Black specks in the wall","Contamination / black specks")
    q=lambda bid: sql(f"SELECT {T('\"qcStatus\"')} FROM {T('\"Batch\"')} WHERE id='{bid}'")
    ck("7. QC held a cap batch and rejected a preform batch", q(c2)=="HOLD" and q(p2)=="REJECTED" and q(p1)=="APPROVED")

    # ── 9. Warehouse receives eligible finished products
    W=ctx(); login(W,"walid")
    for bid in [c1,c2,p1]:
        W.goto(B+f"/inventory?tab=awaiting&batch={bid}"); btn(W,"Confirm receipt")
    ck("9. released stock available; held batch went to quarantine", bal(c1).get("AVAILABLE")==4000 and bal(c2).get("QUARANTINE")==6000 and bal(p1).get("AVAILABLE")==6000)

    # ── 8. Held and rejected quantities can't be dispatched
    W.goto(B+f"/shipments/new?order={oid}")
    ck("8. held batch can't be chosen for a shipment", W.locator(f"input[name='qty_{c2}']").count()==0 or W.locator(f"input[name='qty_{c2}']").is_disabled())
    ck("8. rejected batch is not offered", W.locator(f"input[name='qty_{p2}']").count()==0 or W.locator(f"input[name='qty_{p2}']").is_disabled())

    # ── 10. Partial dispatch, then the remaining shipment
    W.fill(f"input[name='qty_{c1}']","4000"); W.fill(f"input[name='qty_{p1}']","3000"); W.fill("#vehicle","DHK 12345"); W.fill("#driver","Hassan")
    btn(W,"Reserve stock & create shipment"); btn(W,"Confirm dispatch")
    ck("10. first shipment dispatched → order partially delivered", sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="PARTIALLY_DELIVERED")
    inspect(c2,"APPROVE",80,80)  # re-inspection after sorting: released
    ck("   QC approval moved the held stock back to available", bal(c2).get("AVAILABLE")==6000 and bal(c2).get("QUARANTINE",0)==0)
    W.goto(B+f"/shipments/new?order={oid}"); W.fill(f"input[name='qty_{c2}']","6000"); W.fill(f"input[name='qty_{p1}']","3000")
    btn(W,"Reserve stock & create shipment"); btn(W,"Confirm dispatch"); s2=W.url.split("/")[-1]
    ck("10. second shipment completes the order → Delivered", sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="DELIVERED")
    W.goto(B+f"/print/shipments/{s2}"); W.screenshot(path=O+"delivery-note.png", full_page=True)

    # ── 11. Stock and order quantities stay consistent
    shipped=dict(r.split("|") for r in sql(f"SELECT p.code||'|'||SUM(sl.qty) FROM {T('\"ShipmentLine\"')} sl JOIN {T('\"Shipment\"')} s ON s.id=sl.{T('\"shipmentId\"')} JOIN {T('\"OrderLine\"')} l ON l.id=sl.{T('\"orderLineId\"')} JOIN {T('\"Product\"')} p ON p.id=l.{T('\"productId\"')} WHERE s.status='CONFIRMED' GROUP BY p.code").split("\n"))
    ledger=int(sql(f"SELECT SUM(qty) FROM {T('\"StockMovement\"')} WHERE state='SHIPPED'"))
    onhand=int(sql(f"SELECT COALESCE(SUM(qty),0) FROM {T('\"StockMovement\"')} WHERE state IN ('AVAILABLE','RESERVED','QUARANTINE')"))
    ck(f"11. shipped = ordered per product {shipped}", shipped=={"CAP-28":"10000","PF-500":"6000"})
    ck(f"11. stock ledger shipped ({ledger}) = shipment lines; nothing left on hand ({onhand})", ledger==16000 and onhand==0)
    ck("11. every batch balance is non-negative", sql(f"SELECT count(*) FROM (SELECT {T('\"batchId\"')},state,SUM(qty) s FROM {T('\"StockMovement\"')} GROUP BY 1,2 HAVING SUM(qty)<0) x")=="0")

    # ── 12. Management sees the order's full history
    A.goto(B+f"/orders/{oid}"); hist=main_text(A); A.screenshot(path=O+"order-history.png", full_page=True)
    need=[H("order.create_confirm"),H("job.start"),H("production.report"),H("maintenance.create"),H("qc.hold"),H("warehouse.receive"),H("shipment.confirm")]
    missing=[x for x in need if x not in hist]
    ck(f"12. order page shows planning, production, maintenance, QC, receipts and shipments (missing: {missing})", not missing)

    # ── 3. Everyone can view, but can't change without permission
    W.goto(B+f"/orders/{oid}"); ck("3. warehouse can view the order", onum in main_text(W))
    ck("3. …but has no edit/hold/cancel buttons", W.get_by_role("button", name="Put on hold").count()==0 and W.locator(f"a[href='/orders/{oid}/edit']").count()==0)
    P.goto(B+"/customers"); ck("3. production can view customers but not add them", "Zakho" in main_text(P) and P.get_by_text("New customer").count()==0)
    Q.goto(B+f"/production/{j1}"); ck("3. QC sees production read-only", Q.get_by_role("button", name="Add quantity").count()==0)

    # ── 13. Search, filters, reports, exports on real records
    A.goto(B+"/search?q="+onum); ck("13. search by exact order number opens the order", A.url.endswith(f"/orders/{oid}"))
    A.goto(B+"/search?q="+c2n); ck("13. search by batch number opens the batch", "/qc/batches/" in A.url)
    A.goto(B+"/search?q=toyo-01"); ck("13. search by machine number", "/history?machine=" in A.url)
    A.goto(B+"/orders?status=DELIVERED"); ck("13. order list status filter", onum in main_text(A))
    A.goto(B+"/reports/production?from=2026-10-01&to=2026-10-31&group=product"); rep=main_text(A)
    ck("13. production report = 16,500 good pieces", "16,500" in rep)
    A.goto(B+"/reports/quality?from=2026-10-01&to=2026-10-31"); ck("13. rejection report shows the rejected pieces", "30" in main_text(A))
    A.goto(B+"/reports/on-time?from=2026-11-01&to=2026-11-30"); ck("13. on-time delivery report", "On time" in main_text(A))
    r=A.request.get(B+"/api/reports/shipments?from=2026-10-01&to=2026-10-31"); rows=list(csv.reader(io.StringIO(r.body().decode("utf-8").lstrip("﻿"))))
    ck("13. CSV export of shipments totals 16,000 pieces", r.status==200 and rows[-1][0]=="Total" and int(float(rows[-1][5]))==16000)
    A.goto(B+"/print/reports/outstanding"); ck("13. printable PDF report opens", A.locator("img[src='/brand/bereket-logo.jpg']").count()==1)

    # ── 14. Desktop and mobile
    M=br.new_context(**p.devices["iPhone 13"]).new_page(); M.on("pageerror", lambda e: errs.append(str(e))); login(M,"walid")
    over=[]
    for path in ["/dashboard","/inventory","/shipments",f"/orders/{oid}","/reports/shipments","/search?q=ORD"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    M.goto(B+f"/orders/{oid}"); M.screenshot(path=O+"mobile-order.png", full_page=True)
    ck(f"14. phone layout fits the screen on key pages (overflow: {over})", not over)

    # ── 15. Critical actions are in the audit log
    acts=set(sql(f"SELECT DISTINCT action FROM {T('\"AuditLog\"')}").split("\n"))
    need=["setup.first_admin","user.create","order.create_confirm","job.create","production.report","maintenance.create","maintenance.verify","qc.hold","qc.reject","warehouse.receive","shipment.confirm","report.export"]
    ck(f"15. audit log has every critical action (missing: {[a for a in need if a not in acts]})", all(a in acts for a in need))
    who=sql(f"SELECT u.username FROM {T('\"AuditLog\"')} a JOIN {T('\"User\"')} u ON u.id=a.{T('\"userId\"')} WHERE a.action='shipment.confirm' LIMIT 1")
    ck("15. audit log records who confirmed the shipment", who=="walid")

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

    # ── 18. Whole workflow order → final shipment
    ck("18. full workflow from order creation to final customer shipment completed", sql(f"SELECT status FROM {T('\"Order\"')} WHERE id='{oid}'")=="DELIVERED" and sql(f"SELECT count(*) FROM {T('\"Shipment\"')} WHERE {T('\"orderId\"')}='{oid}' AND status='CONFIRMED'")=="2")

    # ── Go-live reset clears test data but keeps people and master data
    A.goto(B+"/admin?tab=system"); A.fill("#confirm","RESET"); A.fill("#reset-password",PW["owner"]); btn(A,"Delete test transactions")
    left=sql(f"SELECT (SELECT count(*) FROM {T('\"Order\"')})+(SELECT count(*) FROM {T('\"Batch\"')})+(SELECT count(*) FROM {T('\"StockMovement\"')})+(SELECT count(*) FROM {T('\"Shipment\"')})")
    ck("go-live reset removed all test transactions", left=="0" and "ready for real use" in main_text(A))
    ck("…kept employees, customers, products, machines and audit log", sql(f"SELECT (SELECT count(*) FROM {T('\"User\"')})||'/'||(SELECT count(*) FROM {T('\"Customer\"')})||'/'||(SELECT count(*) FROM {T('\"Machine\"')})")=="6/1/2" and "system.reset" in sql(f"SELECT action FROM {T('\"AuditLog\"')} ORDER BY {T('\"createdAt\"')} DESC LIMIT 1"))
    S.goto(B+"/orders/new"); combo(S,"customerId","Zakho Water"); S.fill("#requestedDeliveryDate","2026-11-20"); combo(S,"productId[]","CAP-28",0)
    S.locator('input[name="quantity[]"]').nth(0).fill("1000"); btn(S,"Save & confirm"); S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit")
    ck("…and order numbering starts again at 0001", "-0001" in main_text(S))

    ck("no browser errors anywhere", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(1 for _,c in res if c)}/{len(res)} passed")
