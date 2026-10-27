"""Stickers & materials + loading the factory's accounting list (1,860 items) on an EMPTY database.
   Start the app on :3001 against bereket_accept (see TESTING.md), then:
   IMPORT_FILE=<path to bereket-items-import.xlsx> python3 tests/e2e/supplies.py"""
import os, re, subprocess, time
from playwright.sync_api import sync_playwright
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
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
    ck("check: 1,868 new items, no problems", "1,868" in txt)
    t0=time.time(); A.get_by_role("button", name=re.compile("^Import ")).click(); A.wait_for_selector("text=Imported", timeout=180000)
    ck(f"imported in {time.time()-t0:.1f}s", True)
    kinds=sql("SELECT string_agg(kind||'='||n, ',' ORDER BY kind) FROM (SELECT kind, count(*) n FROM \\\"Product\\\" GROUP BY kind) x")
    ck(f"983 products, 811 stickers, 74 materials ({kinds})", set(kinds.split(","))=={"MATERIAL=74","PRODUCT=983","STICKER=811"})
    ck("Arabic + Turkish names stored", sql("SELECT name||' | '||name2 FROM \\\"Product\\\" WHERE code='P-0001'")!="" and sql("SELECT count(*) FROM \\\"Product\\\" WHERE name2 IS NOT NULL")>="1800")
    ck("kg units kept for materials", sql("SELECT count(*) FROM \\\"Product\\\" WHERE unit='kg'")=="48")

    # 2. products page / order sheet / daily sheet show only products
    A.goto(B+"/products"); ck("products page counts only products", "983 products" in A.inner_text("main"))
    A.goto(B+"/orders/new"); ck("order sheet lists only the 983 products", A.locator("input[data-q]").count()==983)
    A.goto(B+"/production/daily"); A.uncheck("text=Only products in open orders") if A.locator("text=Only products in open orders").count() else None
    ck("daily sheet lists only products", A.locator("input[data-q]").count()==983)

    # 3. stickers tab lists stickers; stock comes in/out through Stock Movements
    A.goto(B+"/inventory?tab=stickers"); txt=A.inner_text("main")
    ck("stickers tab lists stickers with both names", "اتيكيت" in txt and "ETIKET" in txt.upper())
    stock_doc(A, B, "BUY", [("S-0001",5000,25)], party="Label printer", currency="IQD", invoice="Invoice 77", paid=0)
    ck("5,000 stickers bought", stock("S-0001")==5000)
    stock_doc(A, B, "OUTPUT", [("S-0001",1200,None)], reason="DAMAGE")
    ck("1,200 out → 3,800 left", stock("S-0001")==3800)
    form=stock_doc(A, B, "OUTPUT", [("S-0001",99999,None)], reason="DAMAGE", save=False)
    ck("output above stock shows a warning", "stock will go below zero" in form)

    # 4. materials: kg with decimals
    stock_doc(A, B, "INPUT", [("M-0002","1250.5",None)], reason="COUNT")
    stock_doc(A, B, "OUTPUT", [("M-0002","25.25",None)], reason="SAMPLE")
    ck("kg with decimals: 1,250.5 in − 25.25 out = 1,225.25", abs(stock("M-0002")-1225.25)<1e-6)
    A.goto(B+"/inventory?tab=materials"); ck("materials page shows kg balance", "1,225.25" in A.inner_text("main"))
    pcs=sql("SELECT code FROM \\\"Product\\\" WHERE kind='MATERIAL' AND unit='pcs' LIMIT 1")
    txt=stock_doc(A, B, "INPUT", [(pcs,"2.5",None)], reason="COUNT")
    ck("pieces items refuse decimals", stock(pcs)==0)
    A.goto(B+"/inventory?tab=movements"); ck("movements list shows Bought / Output", "Bought" in A.inner_text("main") and "Output" in A.inner_text("main"))
    A.goto(B+"/inventory"); ck("products tab doesn't list stickers/materials", "S-0001" not in A.inner_text("main"))
    A.goto(B+"/search?q=S-0001")  # also the code of the supplier made by the purchase above → a list with both
    if "/products/" not in A.url: A.locator("main a[href^='/products/']").first.click(); A.wait_for_load_state("networkidle")
    ck("search finds the label", "/products/" in A.url and "اتيكيت" in A.inner_text("main"))

    # 5. re-import same file → no copies
    A.goto(B+"/import"); A.set_input_files("input[name=file]", F); A.get_by_role("button", name="Check file").click(); A.wait_for_selector("text=Nothing new to import", timeout=120000)
    ck("same file again: nothing new", sql("SELECT count(*) FROM \\\"Product\\\"")=="1868")

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
