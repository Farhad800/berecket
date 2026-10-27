"""Batches, oldest first (owner, 27 Oct 2026): each purchase / production run / priced input is a batch with its own
IQD cost; production, outputs and sales take from the oldest batch; corrections give back; gaps are filled by the next batch.
EMPTY bereket_accept on :3001 started with FIFO_START=2020-01-01 (stock backdated before it = opening stock at the starting cost),
then: python3 tests/e2e/batches.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
P=Q('"Product"'); M=Q('"StockMovement"')
def doc_id(pg): return pg.url.split("/")[-1].split("?")[0]

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    A=br.new_context(viewport={"width":1366,"height":900}).new_page(); A.on("pageerror", lambda e: errs.append(str(e)))
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    for i,code,name,kind,unit,cost in [("tppgranule1","PP-01","PP granules","MATERIAL","kg",3000),("tcarton0001","CART-100","Carton 100","PACKAGING","pcs",1000),("thandle0001","H-01","Plastic handle","PRODUCT","pcs",None),("tbucket0001","B-01","Bucket 8 kg","PRODUCT","pcs",None)]:
        sql(f"INSERT INTO {P} (id,code,name,kind,unit,{Q('\"costIqd\"')},{Q('\"costPrice\"')},{Q('\"costCurrency\"')},{Q('\"costRate\"')},{Q('\"updatedAt\"')}) VALUES ('{i}','{code}','{name}','{kind}','{unit}',{cost or 'NULL'},{cost or 'NULL'},{chr(39)+'IQD'+chr(39) if cost else 'NULL'},{1 if cost else 'NULL'},now())")
    sql(f"INSERT INTO {Q('\"ProductComponent\"')} (id,{Q('\"productId\"')},{Q('\"componentId\"')},qty,per) VALUES ('h1','thandle0001','tppgranule1',20,'PIECE'),('b1','tbucket0001','tppgranule1',500,'PIECE'),('b2','tbucket0001','thandle0001',1,'PIECE'),('b3','tbucket0001','tcarton0001',100,'CARTON')")

    # ── opening stock: counted before batches started → one batch at the starting cost
    stock_doc(A, B, "INPUT", [("PP-01",100,None),("CART-100",10,None)], reason="COUNT")
    sql(f"UPDATE {M} SET {Q('\"createdAt\"')}='2019-06-01' WHERE {Q('\"docId\"')} IS NOT NULL")
    A.goto(B+"/products/tppgranule1"); t=A.inner_text("main")
    ck("item page: opening batch 100 kg at the starting cost 3,000", A.get_by_test_id("lot-left-0").inner_text()=="100" and A.get_by_test_id("lot-cost-0").inner_text()=="3,000" and "Stock on" in t and "Starting cost" in t)

    # ── the owner's example: 1 USD at 1,680, later 1.1 USD at 1,550
    stock_doc(A, B, "BUY", [("PP-01",100,"1")], party="Gulf Polymers", currency="USD", rate=1680); pur1=A.inner_text("main")
    stock_doc(A, B, "BUY", [("PP-01",100,"1.1")], party="Gulf Polymers", currency="USD", rate=1550)
    A.goto(B+"/products/tppgranule1"); t=A.inner_text("main")
    ck("each purchase is its own batch: 1 USD × 1,680 = 1,680 and 1.1 USD × 1,550 = 1,705 per kg", A.get_by_test_id("lot-cost-1").inner_text()=="1,680" and A.get_by_test_id("lot-cost-2").inner_text()=="1,705" and "1 USD × 1,680" in t and "1.1 USD × 1,550" in t)
    ck("value of the 300 kg = 300,000 + 168,000 + 170,500 = 638,500 IQD", "638,500 IQD" in A.get_by_test_id("batches-value").inner_text())
    ck("the starting cost on the item is not changed by buying (3,000)", "3,000 IQD" in A.get_by_test_id("item-cost").inner_text())

    # ── production takes the oldest batch first; the run's batch costs what it really used
    def daily(code_id, q):
        A.goto(B+"/production/daily?shift=A"); A.wait_for_load_state("networkidle")
        A.fill(f"input[name='qty_{code_id}']", str(q)); A.get_by_role("button", name="Save all").click(); A.wait_for_timeout(2500)
    daily("thandle0001", 1000)  # 20 kg from the opening batch @ 3,000 → 60 IQD a handle
    daily("tbucket0001", 300)   # 150 kg: 80 @ 3,000 + 70 @ 1,680; 300 handles @ 60; 3 cartons @ 1,000
    A.goto(B+"/production"); t=A.inner_text("main")
    ck("handle run: real cost 60 IQD / pc (20 kg of the oldest batch @ 3,000)", "Real cost: 60 IQD / pc · run 60,000 IQD" in t)
    ck("bucket run: 80 kg @ 3,000 + 70 kg @ 1,680 + 300 handles @ 60 + 3 cartons @ 1,000 = 378,600 → 1,262 / pc", "Real cost: 1,262 IQD / pc · run 378,600 IQD" in t)
    A.goto(B+"/products/tppgranule1")
    ck("PP batches now: opening used up, first purchase 30 kg left, second 100 kg", "used up" in A.get_by_test_id("lot-left-0").inner_text() and A.get_by_test_id("lot-left-1").inner_text()=="30" and A.get_by_test_id("lot-left-2").inner_text()=="100")

    # ── the product cost estimate uses the next batches to be used
    A.goto(B+"/products/tbucket0001"); A.get_by_test_id("cost-pieces").fill("100"); A.wait_for_timeout(300)
    ck("estimate for 100 buckets: 30 kg @ 1,680 + 20 kg @ 1,705 + 100 handles @ 60 + 1 carton @ 1,000 = 91,500 → 915 / pc", A.get_by_test_id("run-cost").inner_text()=="91,500" and A.get_by_test_id("product-cost").inner_text()=="915 IQD")
    ck("the bucket has its own batch from production (300 pcs at 1,262)", A.get_by_test_id("lot-cost-0").inner_text()=="1,262" and A.get_by_test_id("lot-left-0").inner_text()=="300")

    # ── correction down: the 50 kg go back to the batch they came from (newest taken first)
    eid=sql(f"SELECT id FROM {Q('\"ProductionEntry\"')} WHERE {Q('\"productId\"')}='tbucket0001'")
    A.goto(B+"/production"); A.locator("li", has=A.locator(f"a[href='/qc/entries/{eid}']")).get_by_role("button", name="Correct").click()
    A.fill("input[name=quantity]","200"); A.fill("input[name=reason]","typed wrong"); A.get_by_role("button", name="Save").click(); A.wait_for_timeout(2500)
    A.goto(B+"/production"); t=A.inner_text("main")
    ck("corrected run 200 pcs: 80 kg @ 3,000 + 20 kg @ 1,680 + 200 handles + 2 cartons = 287,600 → 1,438 / pc", "Real cost: 1,438 IQD / pc · run 287,600 IQD" in t)
    A.goto(B+"/products/tppgranule1")
    ck("the 50 kg went back into the first purchase batch (30 → 80 kg)", A.get_by_test_id("lot-left-1").inner_text()=="80")

    # ── other ways out take the oldest too
    stock_doc(A, B, "OUTPUT", [("PP-01",50,None)], reason="DAMAGE")
    A.goto(B+"/products/tppgranule1")
    ck("50 kg damaged come out of the oldest batch (80 → 30)", A.get_by_test_id("lot-left-1").inner_text()=="30")

    # ── an input with a cost is a batch at that cost; without, at the starting cost
    A.goto(B+"/stock/new?type=INPUT"); A.wait_for_load_state("networkidle")
    A.get_by_label("Reason").select_option("RETURN"); A.get_by_label("Cost currency (optional)").select_option("USD"); A.get_by_label("Rate of the day").fill("1600")
    row=A.locator("main ul.divide-y > li").nth(0); row.locator("[id^=item_]").click(); A.keyboard.type("PP-01"); A.wait_for_timeout(250); A.keyboard.press("Enter")
    row.locator("input[type=number]").nth(0).fill("10"); A.get_by_label("PP-01 Cost per unit").fill("2")
    A.get_by_role("button", name=re.compile("^Save input")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); t=A.inner_text("main")
    ck("input saved with its cost: 2 USD, rate 1 USD = 1,600 IQD", "2 USD" in t and "1 USD = 1,600 IQD" in t)
    A.goto(B+"/products/tppgranule1"); t=A.inner_text("main")
    ck("input batch: 10 kg at 2 × 1,600 = 3,200", A.get_by_test_id("lot-cost-3").inner_text()=="3,200" and A.get_by_test_id("lot-left-3").inner_text()=="10" and "2 USD × 1,600" in t)
    A.goto(B+"/inventory?tab=materials"); A.wait_for_load_state("networkidle")
    # 30 @ 1,680 + 100 @ 1,705 + 10 @ 3,200 = 252,900 over 140 kg = 1,806.43
    ck("warehouse: PP-01 cost per kg = its batches ÷ stock = 1,806.43", "1,806.43" in A.get_by_test_id("cost-PP-01").inner_text())

    # ── taking more than is in stock: the gap is costed at the batch that fills it
    stock_doc(A, B, "OUTPUT", [("PP-01",200,None)], reason="OTHER")
    stock_doc(A, B, "BUY", [("PP-01",100,"2000")], party="Gulf Polymers", currency="IQD")
    A.goto(B+"/products/tppgranule1")
    ck("new purchase fills the 60 kg gap first: 40 kg left of it", A.get_by_test_id("lot-left-4").inner_text()=="40" and A.get_by_test_id("lot-cost-4").inner_text()=="2,000" and "80,000 IQD" in A.get_by_test_id("batches-value").inner_text())

    ck("no page errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
