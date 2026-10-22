import re, subprocess, csv, io
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/s7/"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d bereket -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def go(pg,url): pg.goto(url)
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.wait_for_load_state("networkidle")
RANGE="from=2026-01-01&to=2026-12-31"
KEYS=["production","planned-vs-actual","order-completion","on-time","delayed","outstanding","downtime","maintenance","mold-changes","quality","defects","corrective","receipts","movements","shipments"]
db_good=int(sql("SELECT COALESCE(SUM(\\\"qtyGood\\\"),0) FROM \\\"ProductionEntry\\\" WHERE \\\"reportedAt\\\" >= '2025-12-31 21:00' AND \\\"reportedAt\\\" < '2026-12-31 21:00'"))
db_ship=int(sql("SELECT COALESCE(SUM(l.qty),0) FROM \\\"ShipmentLine\\\" l JOIN \\\"Shipment\\\" s ON s.id=l.\\\"shipmentId\\\" WHERE s.status='CONFIRMED'"))
order_no=sql("SELECT number FROM \\\"Order\\\" WHERE status<>'DRAFT' ORDER BY \\\"createdAt\\\" DESC LIMIT 1")
batch_no=sql("SELECT number FROM \\\"Batch\\\" ORDER BY \\\"createdAt\\\" DESC LIMIT 1")
mach=sql("SELECT code FROM \\\"Machine\\\" ORDER BY code LIMIT 1")
cust=sql("SELECT name||'|'||id FROM \\\"Customer\\\" c WHERE EXISTS (SELECT 1 FROM \\\"Order\\\" o WHERE o.\\\"customerId\\\"=c.id) ORDER BY \\\"createdAt\\\" LIMIT 1").split("|")
print("   db good", db_good, "shipped", db_ship, order_no, batch_no, mach, cust[0])
with sync_playwright() as p:
    br=p.chromium.launch(); c=br.new_context(viewport={"width":1366,"height":900}, accept_downloads=True); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    login(pg,"admin","Bereket2026Admin")
    # ── Reports hub and every report
    go(pg,B+"/reports"); ck("reports hub lists all 15 reports", pg.locator("main a[href^='/reports/']").count()==15)
    pg.screenshot(path=O+"hub.png", full_page=True)
    bad=[]
    for k in KEYS:
        go(pg,B+f"/reports/{k}?{RANGE}"); t=pg.inner_text("main")
        if "couldn't load" in t or "Application error" in t or pg.locator("h1").count()==0: bad.append(k)
    ck("all 15 reports open without errors", not bad); print("   bad:", bad)
    # ── Production numbers match the database
    go(pg,B+f"/reports/production?{RANGE}&group=month"); t=pg.inner_text("main")
    ck("production KPI good pcs = database total", f"{db_good:,}" in t)
    ck("monthly grouping shows a month label", "2026-10" in t)
    go(pg,B+f"/reports/production?{RANGE}&group=machine"); ck("machine grouping + chart", pg.locator("figure").count()==1 and mach in pg.inner_text("main"))
    go(pg,B+"/reports/production?from=2026-10-01&to=2026-10-31&group=day"); pg.screenshot(path=O+"production-day.png", full_page=True)
    ck("daily chart has one bar per day (31)", pg.locator("figure [role=img] > div.group").count()==31)
    # filter by customer
    go(pg,B+f"/reports/order-completion?{RANGE}"); all_rows=pg.locator("main table tbody tr").count()
    go(pg,B+f"/reports/order-completion?{RANGE}&customer={cust[1]}")
    t=pg.inner_text("main"); ck("customer filter applied and described", f"Customer: {cust[0]}" in t and pg.locator("main table tbody tr").count()<=all_rows)
    # preset button changes URL
    go(pg,B+"/reports/shipments"); pg.wait_for_load_state("networkidle"); pg.get_by_role("button", name="This year").click(); pg.wait_for_url(re.compile(r".*from=2026-01-01.*"), timeout=8000, wait_until="commit"); pg.wait_for_timeout(1500)
    ck("date preset updates the report", "2026-01-01" in pg.url)
    ck("shipment report pieces = all dispatched pieces", f"{db_ship:,}" in pg.inner_text("main"))
    # bad input is ignored, not trusted
    r=pg.request.get(B+"/reports/production?from=garbage&to=2026-13-45&machine=%27%3Bdrop&group=evil"); ck("malformed filters are ignored safely", r.status==200)
    # ── CSV export
    r=pg.request.get(B+f"/api/reports/production?{RANGE}&group=machine")
    body=r.body().decode("utf-8")
    ck("CSV download works (200, text/csv, attachment)", r.status==200 and "text/csv" in r.headers["content-type"] and "attachment" in r.headers["content-disposition"])
    ck("CSV starts with UTF-8 BOM for Excel", body.startswith("﻿"))
    rows=list(csv.reader(io.StringIO(body.lstrip("﻿"))))
    ck("CSV header is readable and numbers are plain", rows[0][0]=="Machine" and rows[0][1]=="Good pieces" and rows[-1][0]=="Total")
    ck("CSV total good = database total", int(float(rows[-1][1]))==db_good)
    with pg.expect_download() as dl:
        go(pg,B+f"/reports/movements?{RANGE}"); pg.get_by_text("Excel (CSV)").click()
    ck("CSV button downloads a named file", dl.value.suggested_filename.startswith("bereket-movements-2026-01-01"))
    # Arabic CSV headers
    c.add_cookies([{"name":"bfms_locale","value":"ar","url":B}])
    body=pg.request.get(B+f"/api/reports/shipments?{RANGE}").body().decode("utf-8"); ck("CSV follows the user's language (Arabic headers)", "إشعار التسليم" in body.split("\n")[0])
    go(pg,B+f"/reports/production?{RANGE}&group=week"); pg.wait_for_timeout(300)
    ck("Arabic report page is right-to-left", pg.locator("html").get_attribute("dir")=="rtl")
    pg.screenshot(path=O+"report-ar.png", full_page=True)
    c.add_cookies([{"name":"bfms_locale","value":"en","url":B}])
    # ── Printable PDF
    go(pg,B+f"/print/reports/maintenance?{RANGE}"); t=pg.inner_text("body")
    ck("print page: logo, title, period", pg.locator("img[src='/brand/bereket-logo.jpg']").count()==1 and "Maintenance requests" in t and "Period:" in t)
    ck("wide report prints landscape", "landscape" in pg.content())
    pg.pdf(path=O+"maintenance.pdf", format="A4", landscape=True, print_background=True); pg.screenshot(path=O+"print.png", full_page=True)
    ck("exports are written to the audit log", int(sql("SELECT count(*) FROM \\\"AuditLog\\\" WHERE action='report.export' AND \\\"createdAt\\\" > now() - interval '5 minutes'"))>=4)
    # ── Global search
    go(pg,B+"/dashboard"); pg.wait_for_load_state("networkidle"); pg.keyboard.press("/"); ck("'/' focuses the header search", pg.evaluate("document.activeElement?.name")=="q")
    pg.keyboard.type(order_no); pg.keyboard.press("Enter"); pg.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), timeout=8000); pg.wait_for_selector("main [aria-busy=true]", state="detached")
    ck("exact order number jumps straight to the order", order_no in pg.inner_text("main"))
    go(pg,B+"/search?q="+batch_no); pg.wait_for_url(re.compile(r".*/qc/batches/.*"), timeout=8000); ck("exact batch number opens the batch", "/qc/batches/" in pg.url)
    go(pg,B+"/search?q=ORD-"); t=pg.inner_text("main"); ck("partial number lists grouped results", "Customer orders" in t and order_no in t)
    go(pg,B+"/search?q="+cust[0][:5]); ck("customer name search", "Customers" in pg.inner_text("main"))
    go(pg,B+"/search?q="+mach.lower()); pg.wait_for_url(re.compile(r".*/history\?machine=.*"), timeout=8000); ck("machine code search (case-insensitive) opens its history", "/history?machine=" in pg.url)
    go(pg,B+"/search?q=zzqq-nothing"); ck("no-result message", "Nothing found" in pg.inner_text("main"))
    pg.screenshot(path=O+"search.png")
    # ── Audit log page
    go(pg,B+"/audit?entity=Report"); t=pg.inner_text("main"); ck("audit log page filters by record type", "Report exported" in t)
    r=pg.request.get(B+"/api/audit?entity=Report"); ck("audit CSV export", r.status==200 and "report.export" in r.body().decode())
    go(pg,B+"/admin?tab=audit"); ck("old admin audit tab redirects to the new page", pg.url.endswith("/audit"))
    go(pg,B+"/no-such-page"); ck("friendly 404 page", "Page not found" in pg.inner_text("body"))
    # ── Mobile
    m=br.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True); mp=m.new_page(); login(mp,"admin","Bereket2026Admin")
    go(mp,B+f"/reports/outstanding"); ov=mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    ck("report fits a phone screen (no sideways page scroll)", ov<=1)
    mp.screenshot(path=O+"mobile-report.png", full_page=True)
    go(mp,B+"/dashboard"); ck("search icon in phone header", mp.locator("header a[href='/search']").is_visible())
    # ── Permissions
    login(pg,"demo.production"); go(pg,B+f"/reports/production?{RANGE}")
    ck("Production can view reports", "Production output" in pg.inner_text("main"))
    ck("…but sees no export buttons", pg.get_by_text("Excel (CSV)").count()==0)
    ck("…and the CSV endpoint refuses (403)", pg.request.get(B+"/api/reports/production").status==403)
    go(pg,B+"/print/reports/production"); ck("…and the print page is forbidden", "/forbidden" in pg.url)
    go(pg,B+"/audit"); pg.wait_for_url("**/forbidden", timeout=8000); ck("Production can't open the audit log", "/forbidden" in pg.url and "Report exported" not in pg.inner_text("body"))
    ck("audit CSV refuses without permission", pg.request.get(B+"/api/audit").status==403)
    pg.context.clear_cookies(); r=pg.request.get(B+"/api/reports/production", max_redirects=0); ck("signed-out CSV request refused", r.status in (307,401))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
