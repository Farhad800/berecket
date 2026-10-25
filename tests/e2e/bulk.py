"""Bulk master data: Excel import (35 molds, 540 labels), paste labels onto a mold, mold filters.
   Run against the development server with the admin account:  python3 tests/e2e/bulk.py"""
import os, re, subprocess, time
import openpyxl
from playwright.sync_api import sync_playwright
B=os.environ.get("BASE","http://localhost:3000"); DB=os.environ.get("PGDB","bereket")
O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/bulk/"; os.makedirs(O, exist_ok=True)
ADMIN=(os.environ.get("ADMIN_USER","admin"), os.environ.get("ADMIN_PASS","Bereket2026Admin"))
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")

# clean previous runs
sql("DELETE FROM \\\"Product\\\" WHERE code LIKE 'BK%'"); sql("DELETE FROM \\\"Mold\\\" WHERE code LIKE 'BK%'"); sql("DELETE FROM \\\"Machine\\\" WHERE code LIKE 'BKM-%'")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    c=br.new_context(accept_downloads=True); a=c.new_page(); a.on("pageerror", lambda e: errs.append(str(e))); login(a,*ADMIN)

    # 1. template downloads and has the three sheets
    a.goto(B+"/import")
    with a.expect_download() as d: a.get_by_text("Download Excel template").click()
    tpl=O+"template.xlsx"; d.value.save_as(tpl)
    wb=openpyxl.load_workbook(tpl)
    ck(f"template has How to use, Machines, Molds, Products, Recipe sheets {wb.sheetnames}", wb.sheetnames==["How to use","Machines","Molds","Products","Recipe"])

    # 2. fill the template: 4 machines, 35 molds, 540 labels (example rows left in on purpose — they are ignored)
    wb["Machines"].append(["BKM-01","Toyo Si-180","Toyo","Si-180",180])
    for i in range(2,5): wb["Machines"].append([f"BKM-0{i}",f"Toyo Si-{i}50","Toyo",f"Si-{i}50",i*50+100])
    for m in range(1,36): wb["Molds"].append([f"BK-MD{m:02d}",f"Mold {m} ({m*2} cavities)",m*2,"BKM-01" if m==1 else None,None])
    n=0
    for m in range(1,36):
        for l in range(1,16 if m<=36 else 0):
            n+=1
            if n>540: break
            code = f"BK-OWN-{n}" if n%50==0 else None   # some rows bring their own code
            wb["Products"].append([f"BK-MD{m:02d}", code, f"Customer brand {l} – mold {m}", "PP", ["Blue","Red","White"][l%3], 2.5, "yes" if l==1 else "no"])
    f1=O+"factory-list.xlsx"; wb.save(f1)
    a.goto(B+"/import"); a.set_input_files("input[name=file]", f1); a.get_by_role("button", name="Check file").click()
    a.wait_for_selector("text=The file is correct", timeout=60000); txt=a.inner_text("main")
    ck("check shows 4 machines / 35 molds / 525 products as new", re.search(r"Machines\s+4", txt) and re.search(r"Molds\s+35", txt) and "525" in txt)
    ck("nothing saved by the check alone", sql("SELECT count(*) FROM \\\"Mold\\\" WHERE code LIKE 'BK%'")=="0")
    t0=time.time(); a.get_by_role("button", name=re.compile("^Import ")).click(); a.wait_for_selector("text=Imported", timeout=120000); dt=time.time()-t0
    ck(f"import saved in {dt:.1f}s", dt<60)
    cnt=sql("SELECT (SELECT count(*) FROM \\\"Machine\\\" WHERE code LIKE 'BKM-%')||'/'||(SELECT count(*) FROM \\\"Mold\\\" WHERE code LIKE 'BK%')||'/'||(SELECT count(*) FROM \\\"Product\\\" WHERE code LIKE 'BK%')")
    ck(f"database has 4 machines, 35 molds, 525 labels ({cnt})", cnt=="4/35/525")
    ck("labels linked to their molds (15 on BK-MD07)", sql("SELECT count(*) FROM \\\"Product\\\" p JOIN \\\"Mold\\\" m ON m.id=p.\\\"moldId\\\" WHERE m.code='BK-MD07'")=="15")
    ck("automatic codes MOLD-001…", sql("SELECT string_agg(code,',' ORDER BY code) FROM (SELECT p.code FROM \\\"Product\\\" p JOIN \\\"Mold\\\" m ON m.id=p.\\\"moldId\\\" WHERE m.code='BK-MD01' ORDER BY p.code LIMIT 3) x")=="BK-MD01-001,BK-MD01-002,BK-MD01-003")
    ck("own codes kept", sql("SELECT count(*) FROM \\\"Product\\\" WHERE code='BK-OWN-50'")=="1")
    ck("mold mounted on machine from the sheet", sql("SELECT mc.code FROM \\\"Mold\\\" m JOIN \\\"Machine\\\" mc ON mc.id=m.\\\"currentMachineId\\\" WHERE m.code='BK-MD01'")=="BKM-01")
    ck("QC-required flag imported", sql("SELECT count(*) FROM \\\"Product\\\" WHERE code LIKE 'BK%' AND \\\"qcRequired\\\"")=="35")

    # 3. importing the same file again creates no copies
    a.goto(B+"/import"); a.set_input_files("input[name=file]", f1); a.get_by_role("button", name="Check file").click()
    a.wait_for_selector("text=Nothing new to import", timeout=60000)
    ck("same file again → nothing new, no duplicates", sql("SELECT count(*) FROM \\\"Product\\\" WHERE code LIKE 'BK%'")=="525")

    # 4. a file with mistakes is refused with row numbers, nothing saved
    wb2=openpyxl.load_workbook(tpl); wb2["Products"].append(["BK-NOPE",None,"Ghost label","PP",None,None,None]); wb2["Products"].append(["BK-MD01","bad code!","Bad","PP",None,None,None])
    wb2["Molds"].append(["BK-MD99","New mold","lots",None,None]); f2=O+"bad.xlsx"; wb2.save(f2)
    a.goto(B+"/import"); a.set_input_files("input[name=file]", f2); a.get_by_role("button", name="Check file").click()
    a.wait_for_selector("text=problems found", timeout=60000); txt=a.inner_text("main")
    ck("errors listed per sheet and row", "row 4" in txt and "BK-NOPE doesn't exist" in txt and "isn't a valid product code" in txt and "Cavities" in txt)
    ck("no Import button when there are errors", a.get_by_role("button", name=re.compile("^Import ")).count()==0 and sql("SELECT count(*) FROM \\\"Mold\\\" WHERE code='BK-MD99'")=="0")

    # 5. CSV works too
    open(O+"labels.csv","w",encoding="utf-8").write("Mold code,Label / product name,Material\nBK-MD02,Extra label A,PP\nBK-MD02,\"Extra, label B\",PP\n")
    a.goto(B+"/import"); a.set_input_files("input[name=file]", O+"labels.csv"); a.get_by_role("button", name="Check file").click()
    a.wait_for_selector("text=The file is correct", timeout=60000); a.get_by_role("button", name=re.compile("^Import ")).click(); a.wait_for_selector("text=Imported", timeout=60000)
    ck("CSV import with quoted comma", sql("SELECT count(*) FROM \\\"Product\\\" WHERE name IN ('Extra label A','Extra, label B')")=="2")

    # 6. paste labels onto one mold
    mid=sql("SELECT id FROM \\\"Mold\\\" WHERE code='BK-MD35'")
    a.goto(B+f"/assets/molds/{mid}/labels")
    a.fill("#labels","Asia Cola 330 ml\nDuhok Juice 1 L\nBK-ZX9\tZakho Water 500 ml\nAsia Cola 330 ml\nCustomer brand 1 – mold 35")
    a.get_by_role("button", name=re.compile("^Save 5 labels")).click(); a.wait_for_selector("text=labels saved", timeout=30000); txt=a.inner_text("main")
    ck("pasted labels saved; duplicates skipped", "3 labels saved" in txt and "2 were already there" in txt)
    ck("pasted code used; others numbered after existing", sql("SELECT string_agg(code,',' ORDER BY code) FROM \\\"Product\\\" WHERE name IN ('Asia Cola 330 ml','Duhok Juice 1 L','Zakho Water 500 ml')")=="BK-MD35-016,BK-MD35-017,BK-ZX9")

    # 7. products list: mold filter, count, link from molds
    a.goto(B+f"/products?mold={mid}"); txt=a.inner_text("main")
    ck("products filtered by mold (18 labels)", "18 labels" in txt and "Zakho Water 500 ml" in txt)
    a.goto(B+"/assets?tab=molds&q=BK-MD35"); ck("mold card shows label count and links", "18" in a.inner_text("main") and a.locator(f"a[href='/products?mold={mid}']").count()==1)
    a.goto(B+"/products"); ck("long list says to filter", "Showing the first 300" in a.inner_text("main"))

    # 8. order and daily sheets: mold dropdown narrows 500+ rows
    a.goto(B+"/orders/new"); total=a.locator("input[data-q]").count()
    a.locator("select[aria-label='Mold']").select_option("BK-MD07"); a.wait_for_timeout(300); one=a.locator("input[data-q]").count()
    ck(f"order sheet: {total} products, mold filter → {one}", total>=540 and one==15)
    a.fill("input[aria-label='BK-MD07-003 Quantity']","1200"); a.locator("select[aria-label='Mold']").select_option("BK-MD08"); a.fill("input[aria-label='BK-MD08-001 Quantity']","800")
    a.get_by_role("button", name="Save order").click(); a.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit")
    ck("order across two molds saved", "2 products" in a.inner_text("main") or "2,000" in a.inner_text("main"))
    a.goto(B+"/production/daily?shift=A"); a.uncheck("text=Only products in open orders"); a.locator("select[aria-label='Mold']").select_option("BK-MD07")
    ck("daily sheet mold filter", a.locator("input[data-q]").count()==15)
    a.goto(B+"/inventory"); a.locator("select[aria-label='Mold']").select_option("BK-MD07")
    ck("stock list mold filter", a.locator("main li a[href^='/products/']").count()==15)

    # 9. permissions: production can't import
    pr=br.new_context().new_page(); login(pr,"demo.production","Demo12345!"); pr.goto(B+"/import")
    ck("production can't open the import page", "/forbidden" in pr.url)
    ck("template download refused for production", pr.request.get(B+"/api/import/template").status==403)
    ck("audit log has the import and the pasted labels", sql("SELECT count(*) FROM \\\"AuditLog\\\" WHERE action IN ('masterdata.import','product.bulk_create') AND \\\"createdAt\\\">now()-interval '15 minutes'")>="3")

    # 10. phone
    m=br.new_context(**p.devices["iPhone 13"]).new_page(); login(m,*ADMIN); over=[]
    for path in ["/import", f"/assets/molds/{mid}/labels", f"/products?mold={mid}", "/orders/new"]:
        m.goto(B+path); m.wait_for_load_state("networkidle")
        if m.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    m.goto(B+"/import"); m.screenshot(path=O+"mobile-import.png", full_page=True)
    ck(f"phone layout fits (overflow: {over})", not over)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
# clean up
oid=sql("SELECT o.id FROM \\\"Order\\\" o JOIN \\\"OrderLine\\\" l ON l.\\\"orderId\\\"=o.id JOIN \\\"Product\\\" p ON p.id=l.\\\"productId\\\" WHERE p.code LIKE 'BK%' LIMIT 1")
if oid: sql(f"DELETE FROM \\\"Order\\\" WHERE id='{oid}'")
sql("DELETE FROM \\\"Product\\\" WHERE code LIKE 'BK%' OR name LIKE 'Extra%label%'"); sql("DELETE FROM \\\"Mold\\\" WHERE code LIKE 'BK%'"); sql("DELETE FROM \\\"Machine\\\" WHERE code LIKE 'BKM-%'")
print(f"\n{sum(res)}/{len(res)} passed")
