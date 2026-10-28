"""Labels / raw materials / packaging added by hand, their cost, product cost, warehouse sections on Buy (accountant, 26 Oct 2026).
EMPTY database. Checks costs from each item's starting cost, so start the server with FIFO_START in the future
(e.g. FIFO_START=2099-01-01T00:00:00Z); batches.py checks costs from batches. Fresh bereket_accept on :3001 (see TESTING.md),
then: python3 tests/e2e/items.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
P=Q('"Product"')
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def pid(code): return sql(f"SELECT id FROM {P} WHERE code='{code}'")
def stock(code): return float(sql(f"SELECT coalesce(sum(qty),0) FROM {Q('\"StockMovement\"')} m JOIN {P} p ON p.id=m.{Q('\"productId\"')} WHERE p.code='{code}'"))

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

    # ── 1. add items by hand: choose what it is, name, unit and cost
    def new_item(pg, kind, name, unit=None, price=None, cur="IQD", rate=None, bag=None, code=None, save=True):
        pg.goto(B+"/products/new-item"); pg.wait_for_load_state("networkidle")
        pg.get_by_role("radio", name=kind, exact=True).click()
        pg.get_by_label("Name", exact=True).fill(name)
        if code: pg.get_by_label("Code", exact=True).fill(code)
        if unit: pg.get_by_label("Counted in").select_option(unit)
        if bag: pg.get_by_label("Weight of one bag / piece (kg)").fill(str(bag))
        if price is not None:
            pg.get_by_label("Price", exact=True).fill(str(price)); pg.get_by_label("Price currency").select_option(cur)
            if rate: pg.get_by_label("Rate to IQD").fill(str(rate))
        if not save: return pg.inner_text("main")
        pg.get_by_role("button", name="Save item").click()
        try: pg.wait_for_url(re.compile(r".*/products/[^/]+\?created=1$"), timeout=10000)
        except Exception: pass
        pg.wait_for_load_state("networkidle"); return pg.inner_text("main")
    A.goto(B+"/products"); ck("Products page has a New item button", A.get_by_role("link", name="New item").count()==1)
    out=new_item(A,"Label","Zakho label",price=25); ck("label saved with automatic code LBL-0001 and cost 25 IQD", "LBL-0001" in out and sql(f"SELECT kind||'|'||unit||'|'||{Q('\"costIqd\"')}::float FROM {P} WHERE code='LBL-0001'")=="STICKER|pcs|25")
    out=new_item(A,"Raw material","PP granules",price=1.2,cur="USD",save=False)
    ck("USD price asks for the rate (save is off until it is typed)", A.get_by_label("Rate to IQD").count()==1 and A.get_by_role("button", name="Save item").is_disabled())
    A.get_by_label("Rate to IQD").fill("1450"); ck("…and shows the cost in IQD (1,740 IQD / 1 kg)", A.get_by_test_id("cost-iqd").inner_text().replace(" "," ").startswith("In IQD: 1,740 IQD"))
    A.get_by_role("button", name="Save item").click(); A.wait_for_url(re.compile(r".*\?created=1$"))
    ck("raw material: kg, 1.2 USD × 1,450 = 1,740 IQD kept with its currency", sql(f"SELECT unit||'|'||{Q('\"costPrice\"')}::float||'|'||{Q('\"costCurrency\"')}||'|'||{Q('\"costRate\"')}::float||'|'||{Q('\"costIqd\"')}::float FROM {P} WHERE code='MAT-0001'")=="kg|1.2|USD|1450|1740")
    new_item(A,"Packaging","Carton 1800",price=500)
    new_item(A,"Packaging","Nylon bag",unit="kg",bag=0.012,price=3000)
    ck("packaging: carton (pcs) PKG-0001, nylon (kg, 12 g a bag) PKG-0002", sql(f"SELECT string_agg(code||':'||unit||':'||coalesce({Q('\"unitWeightKg\"')}::float::text,'-'),',' ORDER BY code) FROM {P} WHERE kind='PACKAGING'")=="PKG-0001:pcs:-,PKG-0002:kg:0.012")
    new_item(A,"Raw material","Handle",unit="pcs")
    ck("an item can be saved without a cost", sql(f"SELECT {Q('\"costIqd\"')} IS NULL FROM {P} WHERE name='Handle'")=="t")
    out=new_item(A,"Raw material","pp GRANULES",price=1); ck("same name twice in a section is refused", "already exists" in out and sql(f"SELECT count(*) FROM {P} WHERE lower(name)='pp granules'")=="1")
    A.goto(B+"/inventory?tab=packaging"); A.get_by_role("link", name="New item").click(); A.wait_for_load_state("networkidle")
    ck("New item from the Packaging tab starts on Packaging", A.get_by_role("radio", name="Packaging", exact=True).get_attribute("aria-checked")=="true")

    # ── 2. product cost from label + made of + packaging
    sql(f"INSERT INTO {P} (id,code,name,kind,unit,{Q('\"labelId\"')},{Q('\"updatedAt\"')}) VALUES ('tpbowl000001','P-100','Bereket bowl 1800','PRODUCT','pcs','{pid('LBL-0001')}',now())")
    for comp,qty,per in [("MAT-0001",2.1,"PIECE"),("PKG-0001",1800,"CARTON"),("PKG-0002",60,"CARTON")]:
        sql(f"INSERT INTO {Q('\"ProductComponent\"')} (id,{Q('\"productId\"')},{Q('\"componentId\"')},qty,per) VALUES ('pc{comp}','tpbowl000001','{pid(comp)}',{qty},'{per}')")
    A.goto(B+"/products/tpbowl000001"); A.wait_for_load_state("networkidle")
    ck("not made yet → cost for one full carton (1,800 pcs)", A.get_by_test_id("cost-pieces").input_value()=="1800")
    ck("1,800 pcs cost 53,157.2 → one piece 29.53 IQD", A.get_by_test_id("run-cost").inner_text()=="53,157.2" and A.get_by_test_id("product-cost").inner_text()=="29.53 IQD")
    txt=A.inner_text("main"); ck("…each line with what production takes (1,800 labels, 3.78 kg, 1 carton, 0.36 kg nylon)", all(x in txt for x in ["Zakho label","PP granules","Carton 1800","Nylon bag","1,800 pcs","3.78 kg","1 pcs","0.36 kg"]))
    A.get_by_test_id("cost-pieces").fill("1000")
    ck("1,000 pcs: a full carton and 17 whole bags are charged → 29,766 → 29.77 a piece", A.get_by_test_id("run-cost").inner_text()=="29,766" and A.get_by_test_id("product-cost").inner_text()=="29.77 IQD" and "0.204 kg" in A.inner_text("main"))
    A.goto(B+"/inventory"); A.wait_for_load_state("networkidle")
    ck("warehouse products: cost per piece 29.53", A.get_by_test_id("cost-P-100").inner_text().split("\n")[0]=="29.53")
    A.goto(B+"/inventory?tab=materials"); ck("warehouse raw materials: 1,740 IQD per kg", A.get_by_test_id("cost-MAT-0001").inner_text().split("\n")[0]=="1,740")
    # change the material's cost: the product's cost follows
    A.goto(B+f"/products/{pid('MAT-0001')}"); A.get_by_role("button", name="Change cost").click()
    A.get_by_label("Price", exact=True).fill("1.3"); A.get_by_label("Rate to IQD").fill("1460"); A.get_by_role("button", name="Save cost").click(); A.wait_for_timeout(1500)
    ck("item cost changed: 1.3 USD × 1,460 = 1,898 IQD", "1,898 IQD" in A.get_by_test_id("item-cost").inner_text())
    A.goto(B+"/products/tpbowl000001"); ck("product cost follows: 29.86 IQD", A.get_by_test_id("product-cost").inner_text()=="29.86 IQD")
    sql(f"INSERT INTO {Q('\"ProductComponent\"')} (id,{Q('\"productId\"')},{Q('\"componentId\"')},qty,per) VALUES ('pchandle','tpbowl000001','{sql(f"SELECT id FROM {P} WHERE name='Handle'")}',1,'PIECE')")
    A.goto(B+"/products/tpbowl000001"); ck("an item without a cost is named and left out of the total", "Handle" in A.get_by_test_id("cost-missing").inner_text() and A.get_by_test_id("product-cost").inner_text()=="29.86 IQD")
    A.goto(B+"/inventory"); ck("…and marked * in the warehouse", "*" in A.get_by_test_id("cost-P-100").inner_text())

    # ── 3. production still takes the label, materials and packaging from stock
    stock_doc(A, B, "INPUT", [("LBL-0001",5000,None),("MAT-0001",100,None),("PKG-0001",10,None),("PKG-0002",2,None),(sql(f"SELECT code FROM {P} WHERE name='Handle'"),5000,None)], reason="COUNT")
    A.goto(B+"/production/daily?shift=A")
    if A.locator("text=Only products in open orders").count(): A.uncheck("text=Only products in open orders")
    A.fill("input[name='qty_tpbowl000001']","1800"); A.get_by_role("button", name="Save all").click(); A.wait_for_timeout(2500)
    s={c: stock(c) for c in ["P-100","LBL-0001","MAT-0001","PKG-0001","PKG-0002"]}
    ck(f"1,800 pcs made: +1,800 product, −1,800 labels, −3.78 kg PP, −1 carton, −0.36 kg nylon ({s})", s=={"P-100":1800,"LBL-0001":3200,"MAT-0001":96.22,"PKG-0001":9,"PKG-0002":1.64})
    ck("item cost didn't change by production", sql(f"SELECT {Q('\"costIqd\"')}::float FROM {P} WHERE code='MAT-0001'")=="1898")

    # ── 4. Buy: choose the section, the items go into that section; supplier owed in the bought currency
    A.goto(B+"/stock/new?type=BUY"); A.wait_for_load_state("networkidle")
    A.get_by_role("radio", name=re.compile("^Raw materials")).click()
    A.locator("main ul.divide-y > li").nth(0).locator("[id^=item_]").click(); A.wait_for_timeout(300)
    names=[x.strip() for x in A.locator("[role=option] span.flex-1").all_inner_texts()]
    ck(f"Raw materials section lists only raw materials ({names})", sorted(names)==["Handle","PP granules"])
    A.keyboard.press("Escape")
    stock_doc(A, B, "BUY", [("MAT-0001",500,"1.25")], party="Gulf Polymers", currency="USD", paid=0)
    ck("bought 500 kg PP in USD: stock +500 kg, supplier owed 625 USD", stock("MAT-0001")==596.22 and sql(f"SELECT currency||'|'||total::float FROM {Q('\"StockDoc\"')} WHERE type='BUY'")=="USD|625")
    ck("buying doesn't change the item's cost (set by hand only)", sql(f"SELECT {Q('\"costIqd\"')}::float FROM {P} WHERE code='MAT-0001'")=="1898")
    A.goto(B+"/inventory?tab=materials"); ck("…and it is in the Raw materials section", "596.22" in A.inner_text("main"))
    ck("each raw material shows its value in stock (596.22 kg × 1,898 = 1,131,625.56 IQD); no cost → —", A.get_by_test_id("value-MAT-0001").inner_text()=="1,131,625.56" and A.get_by_test_id("value-"+sql(f"SELECT code FROM {P} WHERE name='Handle'")).inner_text()=="—")
    ck("stock value panel opens on Raw materials: 1,131,625.56 IQD, 1 item without a cost", A.get_by_test_id("stock-value").inner_text()=="1,131,625.56 IQD" and "1 of them have no cost yet" in A.inner_text("main"))
    A.goto(B+"/inventory?tab=packaging"); ck("packaging values: 9 cartons × 500 = 4,500 · 1.64 kg nylon × 3,000 = 4,920; section 9,420", A.get_by_test_id("value-PKG-0001").inner_text()=="4,500" and A.get_by_test_id("value-PKG-0002").inner_text()=="4,920" and A.get_by_test_id("stock-value").inner_text()=="9,420 IQD")
    A.goto(B+"/inventory?tab=stickers"); ck("labels: 3,200 × 25 = 80,000", A.get_by_test_id("value-LBL-0001").inner_text()=="80,000" and A.get_by_test_id("stock-value").inner_text()=="80,000 IQD")
    A.goto(B+"/inventory"); ck("products: 1,800 pcs × 29.86 = 53,754.44", A.get_by_test_id("value-P-100").inner_text()=="53,754.44" and A.get_by_test_id("stock-value").inner_text()=="53,754.44 IQD")
    A.get_by_role("radio", name="All", exact=True).click()
    ck("All: 1,274,800 IQD with each section listed", A.get_by_test_id("stock-value").inner_text()=="1,274,800 IQD" and A.get_by_test_id("value-MATERIAL").inner_text()=="1,131,625.56 IQD" and A.get_by_test_id("value-PRODUCT").inner_text()=="53,754.44 IQD")

    # ── 5. only Buy / Sell / Safe roles see costs
    W=ctx(); login(W,"walid",pw["walid"])
    W.goto(B+"/inventory"); h=W.content(); m=W.inner_text("main"); ck("warehouse sees stock but no cost column or value", "Cost / piece" not in m and "Stock value" not in m and "Value (IQD)" not in m and "29.86" not in h and "29.8636" not in h)
    W.goto(B+"/inventory?tab=materials"); h=W.content(); ck("…no material costs", "1,898" not in h and "1898" not in h)
    W.goto(B+"/products/tpbowl000001"); h=W.content(); m=W.inner_text("main"); ck("…no product cost on the product page (not even in the page data)", "Cost of one piece" not in m and "29.86" not in h and "costIqd" not in h and "1898" not in h)
    W.goto(B+f"/products/{pid('MAT-0001')}"); h=W.content(); ck("…no cost on the item page", "1,898" not in h and "1898" not in h)
    W.goto(B+"/products/new-item"); ck("warehouse can't add items", "/forbidden" in W.url)
    S=ctx(); login(S,"sara",pw["sara"])
    S.goto(B+"/products/new-item"); S.get_by_role("radio", name="Label", exact=True).click()
    ck("Sales (may add products, no money) adds items without a cost box", S.get_by_label("Price", exact=True).count()==0)
    S.get_by_label("Name", exact=True).fill("Duhok label"); S.get_by_role("button", name="Save item").click(); S.wait_for_url(re.compile(r".*\?created=1$"))
    ck("…saved as LBL-0002", sql(f"SELECT code FROM {P} WHERE name='Duhok label'")=="LBL-0002")
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id,'stock:sell' FROM {Q('\"Role\"')} WHERE name='Sales Manager'")
    S.goto(B+"/products/tpbowl000001"); ck("once Sales may Sell, it sees the product cost", S.get_by_test_id("product-cost").inner_text()=="29.86 IQD")
    acts=sql(f"SELECT string_agg(DISTINCT action, ',') FROM {Q('\"AuditLog\"')} WHERE action LIKE 'product.%'")
    ck("audit log has the new items and the cost change", "product.create" in acts and "product.cost" in acts)

    # ── 6. phone + Arabic
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/products/new-item","/inventory","/inventory?tab=materials","/products/tpbowl000001",f"/products/{pid('MAT-0001')}","/stock/new?type=BUY"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+"/products/tpbowl000001"); ck("Arabic product cost", "تكلفة القطعة الواحدة" in A.inner_text("main"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
