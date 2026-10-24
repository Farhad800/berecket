"""Stickers & materials + loading the factory's accounting list (1,860 items) on an EMPTY database.
   Start the app on :3001 against bereket_accept (see TESTING.md), then:
   IMPORT_FILE=<path to bereket-items-import.xlsx> python3 tests/e2e/supplies.py"""
import os, re, subprocess, time
from playwright.sync_api import sync_playwright
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
F=os.environ["IMPORT_FILE"]
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def stock_id(i): return float(sql(f"SELECT COALESCE(SUM(qty),0) FROM \\\"StockMovement\\\" WHERE \\\"productId\\\"='{i}'"))
def stock(code): return float(sql(f"SELECT COALESCE(SUM(m.qty),0) FROM \\\"StockMovement\\\" m JOIN \\\"Product\\\" p ON p.id=m.\\\"productId\\\" WHERE p.code='{code}'"))
with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    A=br.new_context().new_page(); A.on("pageerror", lambda e: errs.append(str(e)))
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password","OwnerPass2026!"); A.fill("#confirm","OwnerPass2026!"); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")

    # 1. import the prepared list
    A.goto(B+"/import"); A.set_input_files("input[name=file]", F); A.get_by_role("button", name="Check file").click()
    A.wait_for_selector("text=The file is correct", timeout=120000); txt=A.inner_text("main")
    ck("check: 1,860 new items, no problems", "1,860" in txt)
    t0=time.time(); A.get_by_role("button", name=re.compile("^Import ")).click(); A.wait_for_selector("text=Imported", timeout=180000)
    ck(f"imported in {time.time()-t0:.1f}s", True)
    kinds=sql("SELECT string_agg(kind||'='||n, ',' ORDER BY kind) FROM (SELECT kind, count(*) n FROM \\\"Product\\\" GROUP BY kind) x")
    ck(f"975 products, 811 stickers, 74 materials ({kinds})", set(kinds.split(","))=={"MATERIAL=74","PRODUCT=975","STICKER=811"})
    ck("Arabic + Turkish names stored", sql("SELECT name||' | '||name2 FROM \\\"Product\\\" WHERE code='P-0001'")!="" and sql("SELECT count(*) FROM \\\"Product\\\" WHERE name2 IS NOT NULL")>="1800")
    ck("kg units kept for materials", sql("SELECT count(*) FROM \\\"Product\\\" WHERE unit='kg'")=="48")

    # 2. products page / order sheet / daily sheet show only products
    A.goto(B+"/products"); ck("products page counts only products", "975 products" in A.inner_text("main"))
    A.goto(B+"/orders/new"); ck("order sheet lists only the 975 products", A.locator("input[data-q]").count()==975)
    A.goto(B+"/production/daily"); A.uncheck("text=Only products in open orders") if A.locator("text=Only products in open orders").count() else None
    ck("daily sheet lists only products", A.locator("input[data-q]").count()==975)

    # 3. stickers tab: receive, use, can't use more than in stock
    A.goto(B+"/inventory?tab=stickers"); txt=A.inner_text("main")
    ck("stickers tab lists stickers with both names", "اتيكيت" in txt and "ETIKET" in txt.upper())
    sid=sql("SELECT id FROM \\\"Product\\\" WHERE code='S-0001'")
    A.fill(f"input[name='q_{sid}']","5000"); A.fill("input[name=reference]","Invoice 77"); A.get_by_role("button", name=re.compile("^Save receipt")).click(); A.wait_for_timeout(1500)
    ck("5,000 stickers received", stock("S-0001")==5000)
    A.get_by_role("tab", name="Used (out)").click(); A.fill(f"input[name='q_{sid}']","1200"); A.get_by_role("button", name=re.compile("^Save use")).click(); A.wait_for_timeout(1500)
    ck("1,200 used → 3,800 left", stock("S-0001")==3800)
    A.get_by_role("tab", name="Used (out)").click(); A.evaluate(f"document.querySelector(\"input[name='q_{sid}']\").removeAttribute('max')")
    A.fill(f"input[name='q_{sid}']","99999"); A.get_by_role("button", name=re.compile("^Save use")).click(); A.wait_for_timeout(1500)
    ck("can't use more stickers than in stock", stock("S-0001")==3800 and "only 3,800" in A.inner_text("main"))

    # 4. materials tab: kg with decimals
    A.goto(B+"/inventory?tab=materials"); mid=sql("SELECT id FROM \\\"Product\\\" WHERE code='M-0002'")
    A.fill(f"input[name='q_{mid}']","1250.5"); A.get_by_role("button", name=re.compile("^Save receipt")).click(); A.wait_for_timeout(1500)
    A.get_by_role("tab", name="Used (out)").click(); A.fill(f"input[name='q_{mid}']","25.25"); A.get_by_role("button", name=re.compile("^Save use")).click(); A.wait_for_timeout(1500)
    ck("kg with decimals: 1,250.5 in − 25.25 used = 1,225.25", abs(stock("M-0002")-1225.25)<1e-6)
    A.goto(B+"/inventory?tab=materials"); ck("materials page shows kg balance", "1,225.25" in A.inner_text("main"))
    pcs=sql("SELECT id FROM \\\"Product\\\" WHERE kind='MATERIAL' AND unit='pcs' LIMIT 1")
    A.fill(f"input[name='q_{pcs}']","2.5"); A.get_by_role("button", name=re.compile("^Save receipt")).click(); A.wait_for_timeout(1500)
    ck("pieces items refuse decimals", stock_id(pcs)==0)
    A.goto(B+"/inventory?tab=movements"); ck("movements list shows Received / Used", "Received" in A.inner_text("main") and "Used" in A.inner_text("main"))
    A.goto(B+"/inventory"); ck("products tab doesn't list stickers/materials", "S-0001" not in A.inner_text("main"))
    A.goto(B+"/search?q=S-0001"); ck("search opens the sticker in the warehouse", "/inventory?tab=stickers" in A.url)

    # 5. re-import same file → no copies
    A.goto(B+"/import"); A.set_input_files("input[name=file]", F); A.get_by_role("button", name="Check file").click(); A.wait_for_selector("text=Nothing new to import", timeout=120000)
    ck("same file again: nothing new", sql("SELECT count(*) FROM \\\"Product\\\"")=="1860")

    # 6. phone
    M=br.new_context(**p.devices["iPhone 13"]).new_page(); M.goto(B+"/login"); M.fill("#username","owner"); M.fill("#password","OwnerPass2026!"); M.click("button[type=submit]"); M.wait_for_url("**/dashboard", wait_until="commit")
    over=[]
    for path in ["/inventory?tab=stickers","/inventory?tab=materials","/products"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
