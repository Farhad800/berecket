"""Daily entry sheet (60 jobs in one save), orders with 60 products, and safe deletes.
Runs against the development server on :3000 with demo accounts."""
import os, re, time, subprocess
from playwright.sync_api import sync_playwright
B=os.environ.get("BASE","http://localhost:3000"); DB=os.environ.get("PGDB","bereket")
O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/s9/"; os.makedirs(O, exist_ok=True)
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def Q(name): return f'\\"{name}\\"'
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/dashboard$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def btn(pg,name): pg.get_by_role("button", name=name, exact=True).first.click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(900)
S=str(int(time.time()))[-5:]
# ── test data: 60 products and 7 machines (one of them down)
vals=",".join(f"('bkp{S}{i:02d}xxxxxxxx','BULK-{S}-{i:02d}','Bulk product {i:02d}','pcs',false,now(),now())" for i in range(1,61))
sql(f"INSERT INTO {Q('Product')} (id,code,name,unit,{Q('qcRequired')},{Q('createdAt')},{Q('updatedAt')}) VALUES {vals}")
vals=",".join(f"('bkm{S}{i}xxxxxxxxxx','BK{S}-M{i}','Toyo bulk {i}','AVAILABLE',now(),now())" for i in range(1,8))
sql(f"INSERT INTO {Q('Machine')} (id,code,name,status,{Q('createdAt')},{Q('updatedAt')}) VALUES {vals}")
cust=sql(f"SELECT name FROM {Q('Customer')} WHERE {Q('archivedAt')} IS NULL ORDER BY {Q('createdAt')} LIMIT 1")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def page(**kw):
        pg=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    # ── 1. Order with 60 products using "Add several products"
    s=page(); login(s,"demo.sales"); s.goto(B+"/orders/new")
    s.locator('[id="customerId"]').click(); s.keyboard.type(cust[:12]); s.wait_for_timeout(200); s.keyboard.press("Enter")
    s.fill("#requestedDeliveryDate","2026-11-30")
    btn(s,"Add several products"); s.get_by_placeholder("Search").last.fill(f"BULK-{S}")
    boxes=s.locator("ul.max-h-72 input[type=checkbox]"); n=boxes.count()
    for i in range(n): boxes.nth(i).check()
    s.get_by_role("button", name=re.compile(r"^Add 60 products$")).click(); s.wait_for_timeout(500)
    qty=s.locator('input[name="quantity[]"]'); ck(f"picker added 60 lines at once ({qty.count()})", qty.count()==60)
    for i in range(qty.count()): qty.nth(i).fill("1000")
    btn(s,"Save & confirm"); s.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); s.wait_for_load_state("networkidle")
    oid=s.url.split("/")[-1]; onum=re.search(r"ORD-\d{4}-\d{4}", s.inner_text("main")).group(0)
    ck("order with 60 product lines saved", sql(f"SELECT count(*) FROM {Q('OrderLine')} WHERE {Q('orderId')}='{oid}'")=="60")
    s.screenshot(path=O+"order-60-lines.png", full_page=False)
    # ── 2. 60 planned jobs for today: 10 per machine on 6 machines + 1 on the machine that is down
    me=sql(f"SELECT id FROM {Q('User')} WHERE username='demo.sales'")
    lines=sql(f"SELECT id FROM {Q('OrderLine')} WHERE {Q('orderId')}='{oid}' ORDER BY {Q('lineNo')}").split("\n")
    rows=[]
    for i,l in enumerate(lines):
        m=i//10+1; k=i%10
        rows.append(f"('bkj{S}{i:02d}xxxxxxxx','JOB-BK{S}-{i+1:02d}','{l}','bkm{S}{m}xxxxxxxxxx',1000,(now() - interval '6 hours') + interval '{k*30} minutes',(now() - interval '6 hours') + interval '{k*30+29} minutes','PLANNED','{me}',now(),now())")
    rows.append(f"('bkj{S}99xxxxxxxx','JOB-BK{S}-99','{lines[0]}','bkm{S}7xxxxxxxxxx',100,now(),now() + interval '1 hour','PLANNED','{me}',now(),now())")
    sql(f"INSERT INTO {Q('ProductionJob')} (id,number,{Q('orderLineId')},{Q('machineId')},{Q('plannedQty')},{Q('plannedStart')},{Q('plannedEnd')},status,{Q('createdById')},{Q('createdAt')},{Q('updatedAt')}) VALUES {','.join(rows)}")
    # ── 3. Production enters all 60 jobs in one save
    pr=page(); login(pr,"demo.production"); pr.goto(B+"/production"); pr.get_by_role("link", name="Daily entry sheet").click()
    pr.wait_for_url("**/production/daily", wait_until="commit"); pr.wait_for_load_state("networkidle")
    pr.fill("input[placeholder^='Filter']", f"BK{S}")
    ck("sheet lists all 61 of today's test jobs", pr.locator("main ul li").count()==61)
    for i in range(60):
        jid=f"bkj{S}{i:02d}xxxxxxxx"
        pr.fill(f"input[name=good_{jid}]","1000")
        if i%10<9: pr.check(f"input[name=done_{jid}]")
    pr.fill(f"input[name=good_bkj{S}99xxxxxxxx]","50")
    pr.fill(f"input[name=bad_bkj{S}00xxxxxxxx]","12")
    # Machine 7 breaks down after the sheet was opened: the server must refuse that one row only.
    sql(f"UPDATE {Q('Machine')} SET status='DOWN' WHERE id='bkm{S}7xxxxxxxxxx'")
    ck("running total shows what will be saved", "61 jobs · 60,050 good pieces" in pr.inner_text("body"))
    pr.screenshot(path=O+"daily-sheet-filled.png", full_page=False)
    t0=time.time(); btn(pr,"Save all"); pr.wait_for_selector("text=Saved 60 jobs", timeout=120000); dt=time.time()-t0
    body=pr.inner_text("main")
    ck(f"60 jobs saved in one go ({dt:.1f}s)", "Saved 60 jobs, 60,000 good pieces." in body)
    ck("the machine that is down was refused, the rest still saved", "1 not saved" in body and f"JOB-BK{S}-99" in body and "not available" in body)
    ck("entries written: 60 (one per job)", sql(f"SELECT count(*) FROM {Q('ProductionEntry')} WHERE {Q('jobId')} LIKE 'bkj{S}%'")=="60")
    ck("54 jobs finished, 6 still running (one per machine)", sql(f"SELECT status||':'||count(*) FROM {Q('ProductionJob')} WHERE id LIKE 'bkj{S}%' GROUP BY status ORDER BY status::text")=="COMPLETED:54\nIN_PROGRESS:6\nPLANNED:1")
    ck("good pieces total 60,000 and defects 12", sql(f"SELECT SUM({Q('qtyGood')})||'/'||SUM({Q('qtyDefective')}) FROM {Q('ProductionEntry')} WHERE {Q('jobId')} LIKE 'bkj{S}%'")=="60000/12")
    ck("each machine shows RUNNING", sql(f"SELECT count(*) FROM {Q('Machine')} WHERE id LIKE 'bkm{S}%' AND status='RUNNING'")=="6")
    ck("order status recalculated", sql(f"SELECT status FROM {Q('Order')} WHERE id='{oid}'") in ("IN_PRODUCTION","PARTIALLY_COMPLETED","COMPLETED"))
    ck("saved rows cleared, failed row kept for fixing", pr.input_value(f"input[name=good_bkj{S}09xxxxxxxx]")=="" and pr.input_value(f"input[name=good_bkj{S}99xxxxxxxx]")=="50")
    pr.reload(); pr.wait_for_load_state("networkidle"); pr.fill("input[placeholder^='Filter']", f"BK{S}")
    ck("finished jobs leave the sheet; running ones stay", pr.locator("main ul li").count()==7)
    ck("a planned job on a machine that is down can't be typed into", pr.locator(f"input[name=good_bkj{S}99xxxxxxxx]").is_disabled() and "Machine down" in pr.inner_text("main"))
    # Warehouse can see but not enter
    w=page(); login(w,"demo.warehouse"); w.goto(B+"/production/daily")
    ck("warehouse sees the sheet read-only", w.locator("input[name^=good_]").first.is_disabled() and w.get_by_role("button", name="Save all").count()==0)
    # phone layout
    mp=br.new_context(**p.devices["iPhone 13"]).new_page(); login(mp,"demo.production"); mp.goto(B+"/production/daily"); mp.wait_for_load_state("networkidle")
    ck("sheet fits a phone screen", mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")<=1)
    mp.screenshot(path=O+"daily-sheet-phone.png")
    # ── 4. Deletes
    a=page(); login(a,"admin","Bereket2026Admin"); a.on("dialog", lambda d: d.accept())
    sql(f"INSERT INTO {Q('Machine')} (id,code,name,status,{Q('createdAt')},{Q('updatedAt')}) VALUES ('bkdel{S}xxxxxxxxx','DEL{S}','Typo machine','AVAILABLE',now(),now())")
    sql(f"INSERT INTO {Q('Mold')} (id,code,name,cavities,status,{Q('createdAt')},{Q('updatedAt')}) VALUES ('bkdmo{S}xxxxxxxxx','DMOLD{S}','Typo mold',4,'AVAILABLE',now(),now())")
    a.goto(B+f"/assets?q=DEL{S}"); a.locator("section").filter(has_text=f"DEL{S}").get_by_role("button", name="Delete").click(); a.wait_for_timeout(1500)
    ck("unused machine deleted", sql(f"SELECT count(*) FROM {Q('Machine')} WHERE code='DEL{S}'")=="0")
    a.goto(B+f"/assets?q=BK{S}-M1"); a.locator("section").filter(has_text=f"BK{S}-M1").first.get_by_role("button", name="Delete").click(); a.wait_for_timeout(1500)
    ck("machine with production history can't be deleted (archive offered)", "Use Archive instead" in a.inner_text("main") and sql(f"SELECT count(*) FROM {Q('Machine')} WHERE code='BK{S}-M1'")=="1")
    a.goto(B+f"/assets?tab=molds&q=DMOLD{S}"); a.locator("section").filter(has_text=f"DMOLD{S}").get_by_role("button", name="Delete").click(); a.wait_for_timeout(1500)
    ck("unused mold deleted", sql(f"SELECT count(*) FROM {Q('Mold')} WHERE code='DMOLD{S}'")=="0")
    ck("deletes are in the audit log", sql(f"SELECT count(*) FROM {Q('AuditLog')} WHERE action IN ('machine.delete','mold.delete') AND before->>'code' IN ('DEL{S}','DMOLD{S}')")=="2")
    pp=page(); login(pp,"demo.production"); pp.goto(B+"/assets")
    ck("production has no delete buttons on machines", pp.get_by_role("button", name="Delete").count()==0)
    # order delete: a fresh order with no production
    s.goto(B+"/orders/new"); s.locator('[id="customerId"]').click(); s.keyboard.type(cust[:12]); s.wait_for_timeout(200); s.keyboard.press("Enter")
    s.fill("#requestedDeliveryDate","2026-12-01"); s.locator('[id="productId[]"]').first.click(); s.keyboard.type(f"BULK-{S}-01"); s.wait_for_timeout(200); s.keyboard.press("Enter")
    s.locator('input[name="quantity[]"]').first.fill("5000"); btn(s,"Save & confirm"); s.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); s.wait_for_load_state("networkidle")
    did=s.url.split("/")[-1]; dnum=re.search(r"ORD-\d{4}-\d{4}", s.inner_text("main")).group(0)
    btn(s,"Delete order"); s.fill("input[placeholder='Reason (required)']", "Entered twice by mistake"); s.get_by_role("button", name="Confirm", exact=True).click()
    s.wait_for_url("**/orders?deleted=1", wait_until="commit"); s.wait_for_load_state("networkidle")
    ck("mistaken order deleted and confirmation shown", "Order deleted" in s.inner_text("main") and sql(f"SELECT count(*) FROM {Q('Order')} WHERE id='{did}'")=="0")
    ck("order deletion audited with its number and reason", sql(f"SELECT reason FROM {Q('AuditLog')} WHERE action='order.delete' AND {Q('entityId')}='{did}'")=="Entered twice by mistake")
    s.goto(B+f"/orders/{oid}"); ck("order with production has no Delete button", s.get_by_role("button", name="Delete order").count()==0)
    ck("60-line order page shows all lines", s.inner_text("main").count(f"BULK-{S}-")>=60)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
