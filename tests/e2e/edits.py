"""Editing (owner, 27 Oct 2026): products and items in the same boxes as when added; purchases, sales, inputs, outputs
and money entries changed in place (same number) with a reason — stock, balances and batches follow. EMPTY database.
Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/edits.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
P=Q('"Product"'); D=Q('"StockDoc"'); C=Q('"CashEntry"')
def stock(code): return float(sql(f"SELECT coalesce(sum(qty),0) FROM {Q('\"StockMovement\"')} m JOIN {P} p ON p.id=m.{Q('\"productId\"')} WHERE p.code='{code}'"))
def doc_id(pg): return pg.url.split("/")[-1].split("?")[0]
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def edit_doc(pg, did, reason="typed wrong"):
    """Opens the saved receipt's Edit; returns after the form is ready (caller changes fields, then save_edit)."""
    pg.goto(B+f"/stock/{did}"); pg.get_by_role("link", name="Edit").click(); pg.wait_for_url(re.compile(r".*/stock/new\?edit=")); pg.wait_for_load_state("networkidle")
    pg.get_by_label("Why is it changed?").fill(reason)
def save_edit(pg):
    pg.get_by_role("button", name="Save changes").click()
    try: pg.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$"), timeout=15000)
    except Exception: pass
    pg.wait_for_load_state("networkidle"); return pg.inner_text("main")
def row(pg, i): return pg.locator("main ul.divide-y > li").nth(i)

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        pg=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    yr=sql("SELECT extract(year from now())::int")
    for i,code,name,kind,unit,cost in [("tppgranule1","PP-01","PP granules","MATERIAL","kg",3000),("tcarton0001","CART-100","Carton 100","PACKAGING","pcs",1000),("tlabel00001","LBL-01","Bucket label","STICKER","pcs",25),("tbucket0001","B-01","Bucket 8 kg","PRODUCT","pcs",None)]:
        sql(f"INSERT INTO {P} (id,code,name,kind,unit,{Q('\"costIqd\"')},{Q('\"costPrice\"')},{Q('\"costCurrency\"')},{Q('\"costRate\"')},{Q('\"updatedAt\"')}) VALUES ('{i}','{code}','{name}','{kind}','{unit}',{cost or 'NULL'},{cost or 'NULL'},{chr(39)+'IQD'+chr(39) if cost else 'NULL'},{1 if cost else 'NULL'},now())")
    sql(f"INSERT INTO {Q('\"Mold\"')} (id,code,name,{Q('\"updatedAt\"')}) VALUES ('tmold000001','M-07','Bucket mold',now())")
    sql(f"INSERT INTO {Q('\"ProductComponent\"')} (id,{Q('\"productId\"')},{Q('\"componentId\"')},qty,per) VALUES ('b1','tbucket0001','tppgranule1',500,'PIECE')")

    # ── 1. product: Edit on the list opens the page with the same boxes as New product
    A.goto(B+"/products"); A.wait_for_load_state("networkidle"); A.get_by_role("link", name="Edit").first.click(); A.wait_for_url(re.compile(r".*/products/tbucket0001")); A.wait_for_load_state("networkidle")
    ck("Edit on the Products list opens the product page", "/products/tbucket0001" in A.url)
    ck("…with the boxes of New product, filled in (code, name, second name, mold, QC)", A.get_by_label("Product code *").input_value()=="B-01" and A.get_by_label("Product name").input_value()=="Bucket 8 kg" and A.get_by_label("Second name (Turkish / English)").count()==1 and A.locator("[id=moldId]").count()==1 and A.get_by_text("QC checks this product").count()+A.locator("input[type=checkbox]").count()>=1)
    A.get_by_label("Product code *").fill("B-08"); A.get_by_label("Second name (Turkish / English)").fill("Kova 8 kg")
    A.locator("[id=moldId]").click(); A.keyboard.type("M-07"); A.wait_for_timeout(250); A.keyboard.press("Enter")
    A.get_by_role("button", name="Save made of & packaging").click(); A.wait_for_timeout(1500)
    ck("product saved: code B-08, second name, mold M-07, recipe kept", sql(f"SELECT code||'|'||name2||'|'||coalesce({Q('\"moldId\"')},'') FROM {P} WHERE id='tbucket0001'")=="B-08|Kova 8 kg|tmold000001" and sql(f"SELECT count(*) FROM {Q('\"ProductComponent\"')} WHERE {Q('\"productId\"')}='tbucket0001'")=="1")
    A.goto(B+"/products/tbucket0001"); A.get_by_label("Product code *").fill("PP-01"); A.get_by_role("button", name="Save made of & packaging").click(); A.wait_for_timeout(1200)
    ck("a code already used by another item is refused", "already used" in A.inner_text("main") and sql(f"SELECT code FROM {P} WHERE id='tbucket0001'")=="B-08")

    # ── 2. item: the same boxes as New item
    A.goto(B+"/products/tcarton0001"); A.get_by_role("button", name="Edit item").click()
    ck("item edit shows section, name, second name, code, unit", A.get_by_label("Name", exact=True).input_value()=="Carton 100" and A.get_by_label("Code", exact=True).input_value()=="CART-100" and A.get_by_label("Counted in").count()==1 and A.get_by_role("radio", name="Packaging").get_attribute("aria-checked")=="true")
    A.get_by_label("Name", exact=True).fill("Carton 100 pcs"); A.get_by_label("Code", exact=True).fill("PKG-100"); A.get_by_role("button", name="Save", exact=True).click(); A.wait_for_timeout(1500)
    ck("item saved: name and code changed", sql(f"SELECT code||'|'||name FROM {P} WHERE id='tcarton0001'")=="PKG-100|Carton 100 pcs")

    # money in the safe for the tests below
    A.goto(B+"/cash/new?type=IN"); A.get_by_label("Amount", exact=True).fill("1000000"); A.get_by_label("Note").fill("Owner"); A.get_by_role("button", name="Save money in").click(); A.wait_for_timeout(1500)
    A.goto(B+"/cash/new?type=IN"); A.get_by_label("Currency", exact=True).select_option("USD"); A.get_by_label("Amount", exact=True).fill("1000"); A.get_by_label("Note").fill("Owner"); A.get_by_role("button", name="Save money in").click(); A.wait_for_timeout(1500)

    # ── 3. purchase edited in place: same number; rate, quantity and price change; stock, batch and balance follow
    stock_doc(A, B, "BUY", [("PP-01",10,"1")], party="Gulf Polymers", currency="USD", rate=1500, paid=5)
    bid=doc_id(A); num=sql(f"SELECT number||'|'||{Q('\"invoiceNo\"')} FROM {D} WHERE id='{bid}'")
    ck("purchase saved: 10 kg @ 1 USD, rate 1,500, 5 USD paid", stock("PP-01")==10 and sql(f"SELECT total::float||'|'||rate::float FROM {D} WHERE id='{bid}'")=="10|1500")
    edit_doc(A, bid, "rate was 1,680 and price 1.1")
    ck("edit form is filled with the saved values (customer, rate, line)", A.get_by_label("Rate of the day").input_value()=="1500" and row(A,0).locator("input[type=number]").nth(0).input_value()=="10" and row(A,0).locator("input[type=number]").nth(1).input_value()=="1" and "Gulf Polymers" in A.inner_text("main"))
    A.get_by_label("Rate of the day").fill("1680"); row(A,0).locator("input[type=number]").nth(0).fill("20"); row(A,0).locator("input[type=number]").nth(1).fill("1.1")
    out=save_edit(A)
    ck("same number after the edit", sql(f"SELECT number||'|'||{Q('\"invoiceNo\"')} FROM {D} WHERE id='{bid}'")==num and sql(f"SELECT count(*) FROM {D} WHERE type='BUY'")=="1")
    ck("stock follows: 20 kg; total 22 USD; rate 1,680", stock("PP-01")==20 and sql(f"SELECT total::float||'|'||rate::float FROM {D} WHERE id='{bid}'")=="22|1680" and "1 USD = 1,680 IQD" in out)
    ck("paid stays 5 USD; the customer is owed 22 − 5 = 17 USD", "17 USD" in A.get_by_test_id("customer-balance").inner_text() and sql(f"SELECT sum(amount)::float FROM {C} WHERE {Q('\"stockDocId\"')}='{bid}'")=="-5")
    A.goto(B+"/products/tppgranule1")
    ck("batch follows the edit: 20 kg at 1.1 × 1,680 = 1,848", A.get_by_test_id("lot-cost-0").inner_text()=="1,848" and A.get_by_test_id("lot-left-0").inner_text()=="20")
    edit_doc(A, bid, "try lower"); row(A,0).locator("input[type=number]").nth(0).fill("1"); row(A,0).locator("input[type=number]").nth(1).fill("1"); save_edit(A)
    ck("a total below what was already paid is refused", "already paid" in A.inner_text("main") and sql(f"SELECT total::float FROM {D} WHERE id='{bid}'")=="22")
    A.goto(B+f"/stock/{bid}"); A.get_by_role("link", name="Edit").click(); A.wait_for_load_state("networkidle")
    ck("Save changes needs a reason", A.get_by_role("button", name="Save changes").is_disabled())

    # ── 4. sale moved to another customer: both balances follow
    stock_doc(A, B, "SELL", [("PP-01",5,"5000")], party="Al Noor", currency="IQD")
    sid=doc_id(A)
    edit_doc(A, sid, "it was for Zakho Market")
    A.locator("[id=customerId]").click(); A.keyboard.type("Zakho Market"); A.wait_for_timeout(250); A.keyboard.press("Escape"); A.locator("main h1").first.click()
    A.get_by_role("button", name="New customer").first.click(); A.get_by_label("Customer name").fill("Zakho Market"); A.get_by_role("button", name="Add customer").click(); A.wait_for_timeout(1200)
    row(A,0).locator("input[type=number]").nth(0).fill("6"); save_edit(A)
    noor=sql(f"SELECT id FROM {Q('\"Customer\"')} WHERE name='Al Noor'"); zakho=sql(f"SELECT id FROM {Q('\"Customer\"')} WHERE name='Zakho Market'")
    A.goto(B+f"/customers/{noor}"); n_bal=A.get_by_test_id("balance-IQD").inner_text()
    A.goto(B+f"/customers/{zakho}"); z_bal=A.get_by_test_id("balance-IQD").inner_text()
    ck(f"sale moved: Al Noor back to 0, Zakho Market −30,000 (6 × 5,000) ({n_bal}, {z_bal})", n_bal=="0 IQD" and z_bal=="-30,000 IQD" and stock("PP-01")==14)

    # ── 5. output: quantity and reason changed
    stock_doc(A, B, "OUTPUT", [("PP-01",2,None)], reason="DAMAGE")
    oid=doc_id(A); edit_doc(A, oid, "only 1 kg was damaged")
    row(A,0).locator("input[type=number]").nth(0).fill("1"); A.get_by_label("Reason").select_option("SAMPLE"); save_edit(A)
    ck("output edited: 1 kg out, reason Sample; stock 13", stock("PP-01")==13 and sql(f"SELECT reason FROM {D} WHERE id='{oid}'")=="SAMPLE")

    # ── 6. money entries edited in place
    A.goto(B+"/cash/new?type=OUT"); A.get_by_label("Amount", exact=True).fill("200000"); A.get_by_label("Spent on").select_option(index=1); A.get_by_role("button", name=re.compile("^Save expense")).click()
    A.wait_for_url(re.compile(r".*/cash/[^/]+\?saved=1$")); eid=A.url.split("/")[-1].split("?")[0]; enum=sql(f"SELECT number FROM {C} WHERE id='{eid}'")
    A.get_by_role("button", name="Edit entry").click(); A.get_by_label("New amount").fill("150000"); A.get_by_label("Paid to").fill("Electric company"); A.get_by_label("Why is it changed?").fill("bill was 150,000")
    A.get_by_role("button", name="Save changes").click(); A.wait_for_timeout(1500)
    ck("expense edited in place: 150,000, same number, paid to", sql(f"SELECT amount::float||'|'||number||'|'||party FROM {C} WHERE id='{eid}'")==f"-150000|{enum}|Electric company" and "150,000" in A.inner_text("main"))
    A.get_by_role("button", name="Edit entry").click(); A.get_by_label("New amount").fill("5000000"); A.get_by_label("Why is it changed?").fill("too much")
    A.get_by_role("button", name="Save changes").click(); A.wait_for_timeout(1500)
    ck("an edit that would take the safe below zero is refused", "below zero" in A.inner_text("main") and sql(f"SELECT amount::float FROM {C} WHERE id='{eid}'")=="-150000")
    pay=sql(f"SELECT id FROM {C} WHERE {Q('\"stockDocId\"')}='{bid}'")
    A.goto(B+f"/cash/{pay}"); A.get_by_role("button", name="Edit entry").click(); A.get_by_label("New amount").fill("30"); A.get_by_label("Why is it changed?").fill("paid more")
    A.get_by_role("button", name="Save changes").click(); A.wait_for_timeout(1500)
    ck("a payment above the purchase total (22) is refused", "more than its total" in A.inner_text("main"))
    A.get_by_label("New amount").fill("12"); A.get_by_role("button", name="Save changes").click(); A.wait_for_timeout(1500)
    A.goto(B+f"/stock/{bid}")
    ck("payment edited to 12 USD: still owed 10 USD on the purchase", "10 USD" in A.inner_text("main") and sql(f"SELECT amount::float FROM {C} WHERE id='{pay}'")=="-12")

    # ── 7. history and permissions
    acts=set(sql(f"SELECT string_agg(DISTINCT action, ',') FROM {Q('\"AuditLog\"')}").split(","))
    ck("history keeps stock.edit and cash.edit with the reasons", {"stock.edit","cash.edit","product.update"}<=acts and sql(f"SELECT count(*) FROM {Q('\"AuditLog\"')} WHERE action='stock.edit' AND reason='rate was 1,680 and price 1.1'")=="1")
    A.goto(B+"/audit"); ck("History page names the changes", "Receipt changed" in A.inner_text("main") and "Money entry changed" in A.inner_text("main"))
    A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId","1005"); A.fill("#fullName","Walid Warehouse"); A.fill("#username","walid")
    A.select_option("#roleId", label="Warehouse Team"); A.select_option("#departmentId", label="Warehouse"); A.click("form button[type=submit]")
    A.wait_for_selector("text=Temporary password"); temp=A.locator("code").nth(1).inner_text()
    W=ctx(); login(W,"walid",temp); W.fill("#current",temp); W.fill("#next","WalidFactory2026"); W.fill("#confirm","WalidFactory2026"); W.click("button[type=submit]"); W.wait_for_url("**/dashboard", wait_until="commit")
    W.goto(B+f"/stock/{bid}"); ck("warehouse can't edit a purchase (no Edit button)", W.get_by_role("link", name="Edit").count()==0)
    W.goto(B+f"/stock/new?edit={bid}"); ck("…nor open its edit form", "/forbidden" in W.url)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
