"""Made of + packaging per product, and automatic use of labels/materials/cartons/nylon from daily production.
   Fresh bereket_accept on :3001;  IMPORT_FILE=<bereket-items-FINAL.xlsx> python3 tests/e2e/recipes.py"""
import os, re, subprocess, openpyxl
from playwright.sync_api import sync_playwright
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); F=os.environ["IMPORT_FILE"]
O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/recipes/"; os.makedirs(O, exist_ok=True)
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def pid(code): return sql(f"SELECT id FROM \\\"Product\\\" WHERE code='{code}'")
def stock(code): return round(float(sql(f"SELECT COALESCE(SUM(m.qty),0) FROM \\\"StockMovement\\\" m JOIN \\\"Product\\\" p ON p.id=m.\\\"productId\\\" WHERE p.code='{code}'")),3)
PROD,LABEL,RAW,DYE,CART,NYL="0007.5","0007.22","0001","0020","0095","0061"
with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    A=br.new_context().new_page(); A.on("pageerror", lambda e: errs.append(str(e)))
    A.goto(B+"/setup"); A.fill("#token","acceptance-setup-token-2026"); A.fill("#employeeId","0001"); A.fill("#fullName","Owner"); A.fill("#username","owner")
    A.fill("#password","OwnerPass2026!"); A.fill("#confirm","OwnerPass2026!"); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    A.goto(B+"/import"); A.set_input_files("input[name=file]", F); A.get_by_role("button", name="Check file").click(); A.wait_for_selector("text=The file is correct", timeout=120000)
    A.get_by_role("button", name=re.compile("^Import ")).click(); A.wait_for_selector("text=Imported", timeout=180000)
    ck("final list in: 957 products, 785 labels, 37 raw materials, 35 packaging", set(sql("SELECT kind||'='||count(*) FROM \\\"Product\\\" GROUP BY kind").split("\n"))=={"PRODUCT=957","STICKER=785","MATERIAL=37","PACKAGING=35"})
    A.goto(B+"/inventory?tab=packaging"); ck("Packaging tab lists nylon and cartons", "نايلون كاسات" in A.inner_text("main") and "كارتون كاسة 700" in A.inner_text("main"))
    A.goto(B+"/inventory?tab=materials"); ck("Raw materials tab has granules and dyes, not nylon", "حبيبات" in A.inner_text("main") and "صبغ" in A.inner_text("main") and "نايلون" not in A.inner_text("main"))
    # receive opening stock
    stock_doc(A, B, "INPUT", [(LABEL,5000,None),(RAW,100,None),(DYE,5,None),(CART,10,None),(NYL,2,None)], reason="COUNT")
    ck("opening stock entered with one Input document", stock(LABEL)==5000 and stock(RAW)==100 and stock(DYE)==5 and stock(CART)==10 and stock(NYL)==2)
    # nylon bag weight
    A.goto(B+f"/products/{pid(NYL)}"); A.fill("input[aria-label='Weight of one bag / piece']","0.012"); A.get_by_role("button", name="Save").click(); A.wait_for_timeout(1200)
    ck("nylon bag weight saved", sql(f"SELECT \\\"unitWeightKg\\\" FROM \\\"Product\\\" WHERE code='{NYL}'").startswith("0.012"))
    # recipe on the product page
    A.goto(B+f"/products/{pid(PROD)}")
    def combo(i, text):
        A.locator("[id^='c_'], [aria-haspopup]").nth(i)  # placeholder
    A.locator("text=No label").first.click(); A.keyboard.type("بركة كاسة اتيكيت 700"); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.get_by_role("button", name=re.compile("^Add material")).click(); A.get_by_text("Choose item…").last.click(); A.keyboard.type(RAW); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.locator("input[type=number]:not([data-testid=cost-pieces])").nth(0).fill("45")
    A.get_by_role("button", name=re.compile("^Add material")).click(); A.get_by_text("Choose item…").last.click(); A.keyboard.type("صبغ اسود"); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.locator("input[type=number]:not([data-testid=cost-pieces])").nth(1).fill("0.9")
    A.get_by_role("button", name="Add carton / nylon").click(); A.get_by_text("Choose item…").last.click(); A.keyboard.type(CART); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.locator("input[type=number]:not([data-testid=cost-pieces])").nth(2).fill("1800")   # one carton holds 1,800
    A.get_by_role("button", name="Add carton / nylon").click(); A.get_by_text("Choose item…").last.click(); A.keyboard.type(NYL); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.locator("input[type=number]:not([data-testid=cost-pieces])").nth(3).fill("60")     # one nylon bag holds 60
    A.locator("input[aria-label='pieces']").fill("2000"); A.wait_for_timeout(300)
    prev=A.inner_text("main"); A.screenshot(path=O+"recipe.png", full_page=True)
    ck("preview for 2,000 pcs: 2,000 labels, 90 kg, 1.8 kg dye, 2 cartons, 0.408 kg nylon (34 bags)", all(x in prev for x in ["2,000 pcs","90 kg","1.8 kg","2 pcs","0.408 kg"]))
    A.get_by_role("button", name="Save made of & packaging").click(); A.wait_for_timeout(1500)
    ck("recipe saved (label + 4 lines)", sql(f"SELECT count(*) FROM \\\"ProductComponent\\\" WHERE \\\"productId\\\"='{pid(PROD)}'")=="4" and sql(f"SELECT \\\"labelId\\\" FROM \\\"Product\\\" WHERE code='{PROD}'")==pid(LABEL))
    # daily production
    def daily(q, shift="A"):
        A.goto(B+f"/production/daily?shift={shift}")
        if A.locator("text=Only products in open orders").count(): A.uncheck("text=Only products in open orders")
        A.fill(f"input[name='qty_{pid(PROD)}']", str(q)); A.get_by_role("button", name="Save all").click(); A.wait_for_timeout(2500); return A.inner_text("main")
    daily(2000)
    s1={c:stock(c) for c in [PROD,LABEL,RAW,DYE,CART,NYL]}
    ck(f"2,000 pcs used: label 3,000 · raw 10 · dye 3.2 · cartons 8 · nylon 1.592 · product +2,000 ({s1})", s1=={PROD:2000,LABEL:3000,RAW:10,DYE:3.2,CART:8,NYL:1.592})
    txt=daily(2000)
    s2={c:stock(c) for c in [LABEL,RAW,CART,NYL]}
    ck(f"same day+shift again → entry 4,000: label 1,000 · raw −80 · cartons 7 (3 total) · nylon 1.196 (67 bags) ({s2})", s2=={LABEL:1000,RAW:-80,CART:7,NYL:1.196})
    ck("production still saved and a shortage warning shown", "not enough" in txt and RAW in txt)
    A.goto(B+"/inventory?tab=materials"); ck("minus stock shown in red", A.locator(".text-red-600", has_text="-80").count()>=1)
    # correction
    eid=sql(f"SELECT id FROM \\\"ProductionEntry\\\" WHERE \\\"productId\\\"='{pid(PROD)}'")
    A.goto(B+"/production"); A.locator("li", has=A.locator(f"a[href='/qc/entries/{eid}']")).get_by_role("button", name="Correct").click()
    A.fill("input[name=quantity]","1000"); A.fill("input[name=reason]","typed wrong"); A.get_by_role("button", name="Save").click(); A.wait_for_timeout(2500)
    s3={c:stock(c) for c in [LABEL,RAW,DYE,CART,NYL]}
    ck(f"corrected to 1,000: label 4,000 · raw 55 · dye 4.1 · cartons 9 · nylon 1.796 ({s3})", s3=={LABEL:4000,RAW:55,DYE:4.1,CART:9,NYL:1.796})
    A.goto(B+"/production"); A.locator("li", has=A.locator(f"a[href='/qc/entries/{eid}']")).get_by_role("button", name="Correct").click()
    A.fill("input[name=quantity]","0"); A.fill("input[name=reason]","entered by mistake"); A.get_by_role("button", name="Save").click(); A.wait_for_timeout(2500)
    s4={c:stock(c) for c in [PROD,LABEL,RAW,DYE,CART,NYL]}
    ck(f"deleted entry gives everything back ({s4})", s4=={PROD:0,LABEL:5000,RAW:100,DYE:5,CART:10,NYL:2})
    # new product: label + made of + packaging in one form
    A.goto(B+"/products"); A.get_by_role("link", name="New product").click(); A.wait_for_url("**/products/new")
    ck("new product: name typed by hand, label chosen under Made of", A.get_by_label("Product name").count()==1 and A.locator("#labelId").count()==1 and "Made of" in A.inner_text("main") and A.inner_text("main").index("Product name") < A.inner_text("main").index("Label"))
    A.locator("#labelId").click(); A.keyboard.type("دريا كاسة اتيكيت 1600"); A.wait_for_timeout(300); A.keyboard.press("Enter")
    ck("choosing a label doesn't fill in the name", A.get_by_label("Product name").input_value()=="")
    A.get_by_label("Product name").fill("دريا كاسة 1600 غم"); A.get_by_label("Second name (Turkish / English)").fill("1600 GR DERYA KASE")
    A.get_by_label("Product code *").fill("TEST-1")
    A.get_by_role("button", name=re.compile("^Add material")).click(); A.get_by_text("Choose item…").last.click(); A.keyboard.type(RAW); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.locator("input[type=number]:not([data-testid=cost-pieces])").nth(0).fill("60")
    A.get_by_role("button", name="Add carton / nylon").click(); A.get_by_text("Choose item…").last.click(); A.keyboard.type(CART); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.locator("input[type=number]:not([data-testid=cost-pieces])").nth(1).fill("1200")
    A.get_by_role("button", name="Create product").click(); A.wait_for_url(re.compile(r".*/products/c[a-z0-9]+\?created=1"), wait_until="commit"); A.wait_for_load_state("networkidle")
    t1=pid("TEST-1")
    ck("new product created with its typed name, label link and 2 lines", sql("SELECT name||' | '||name2 FROM \\\"Product\\\" WHERE code='TEST-1'")=="دريا كاسة 1600 غم | 1600 GR DERYA KASE"
       and sql(f"SELECT count(*) FROM \\\"ProductComponent\\\" WHERE \\\"productId\\\"='{t1}'")=="2" and sql("SELECT \\\"labelId\\\" FROM \\\"Product\\\" WHERE code='TEST-1'")==pid("0090.77") and "Product created" in A.inner_text("main"))
    A.goto(B+"/products/new"); A.locator("#labelId").click(); A.keyboard.type("دريا كاسة اتيكيت 1600"); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.get_by_label("Product code *").fill("TEST-2"); A.get_by_role("button", name="Create product").click(); A.wait_for_timeout(1500)
    ck("a label but no typed name is refused (the name never comes from the label)", "Type the product's name" in A.inner_text("main") and sql("SELECT count(*) FROM \\\"Product\\\" WHERE code='TEST-2'")=="0")
    A.goto(B+f"/products/{t1}"); A.locator("#labelId").click(); A.keyboard.type("No label"); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.get_by_role("button", name="Save made of & packaging").click(); A.wait_for_timeout(1500)
    A.goto(B+f"/products/{t1}"); A.locator("#labelId").click(); A.keyboard.type("دريا كاسة اتيكيت 1600"); A.wait_for_timeout(300); A.keyboard.press("Enter")
    A.get_by_role("button", name="Save made of & packaging").click(); A.wait_for_timeout(1500)
    ck("changing the label on a product keeps its typed name", sql("SELECT name FROM \\\"Product\\\" WHERE code='TEST-1'")=="دريا كاسة 1600 غم")
    # import: label codes + pieces per carton + Recipe sheet
    wb=openpyxl.Workbook(); w=wb.active; w.title="Products"; w.append(["Product code","Label / product name","Kind (product/sticker/material)","Label code"])
    w.append(["0007.6","اسود كاسة 700 غم","product",None]); w.append(["0007.7","خيرات دهوك كاسة 700 غم","product","0007.22"])
    r=wb.create_sheet("Recipe"); r.append(["Product code","Item code","Quantity","Per (piece / pack)"])
    r.append(["0007.6",RAW,44,"piece"]); r.append(["0007.6",CART,1800,"pack"]); r.append(["0007.6",NYL,60,"pack"]); r.append(["0007.6","NOPE",1,"piece"])
    wb.save(O+"recipe-import.xlsx")
    A.goto(B+"/import"); A.set_input_files("input[name=file]", O+"recipe-import.xlsx"); A.get_by_role("button", name="Check file").click(); A.wait_for_selector("text=problems found", timeout=60000)
    ck("recipe import: unknown item refused with row number", "Item NOPE doesn't exist" in A.inner_text("main"))
    r.delete_rows(5); wb.save(O+"recipe-import.xlsx")
    A.goto(B+"/import"); A.set_input_files("input[name=file]", O+"recipe-import.xlsx"); A.get_by_role("button", name="Check file").click(); A.wait_for_selector("text=The file is correct", timeout=60000)
    A.get_by_role("button", name=re.compile("^Import ")).click(); A.wait_for_selector("text=Imported", timeout=60000)
    ck("recipe lines + label imported", sql(f"SELECT count(*) FROM \\\"ProductComponent\\\" WHERE \\\"productId\\\"='{pid('0007.6')}'")=="3" and sql("SELECT \\\"labelId\\\" FROM \\\"Product\\\" WHERE code='0007.7'")==pid(LABEL))
    A.goto(B+f"/products/{pid(LABEL)}"); ck("label page lists the products that use it", "بركة كاسة 700" in A.inner_text("main") and "خيرات دهوك" in A.inner_text("main"))
    M=br.new_context(**p.devices["iPhone 13"]).new_page(); M.goto(B+"/login"); M.fill("#username","owner"); M.fill("#password","OwnerPass2026!"); M.click("button[type=submit]"); M.wait_for_url("**/dashboard", wait_until="commit")
    M.goto(B+f"/products/{pid(PROD)}"); M.wait_for_load_state("networkidle"); ck("product page fits a phone", M.evaluate("document.documentElement.scrollWidth - window.innerWidth")<=1)
    M.screenshot(path=O+"recipe-phone.png", full_page=True)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
