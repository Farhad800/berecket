import re, subprocess, time
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/e2e/"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d bereket -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.wait_for_load_state("networkidle")
def combo(pg, name, text, nth=0):
    pg.locator(f'[id="{name}"]').nth(nth).click(); pg.keyboard.type(text); pg.wait_for_timeout(150); pg.keyboard.press("Enter")
def btn(pg,name,exact=True): pg.get_by_role("button", name=name, exact=exact).first.click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(900)
def bal(bid):
    rows=sql(f"SELECT state||'='||SUM(qty) FROM \\\"StockMovement\\\" WHERE \\\"batchId\\\"='{bid}' GROUP BY state")
    return {k:int(v) for k,v in (r.split("=") for r in rows.split("\n") if r)}
prod_code=sql("""SELECT code FROM \\"Product\\" WHERE code LIKE 'PF500-%' ORDER BY \\"createdAt\\" DESC LIMIT 1""")
cust=sql("""SELECT name FROM \\"Customer\\" ORDER BY \\"createdAt\\" DESC LIMIT 1""")
mach=sql("""SELECT code FROM \\"Machine\\" WHERE status='AVAILABLE' AND code LIKE 'T%B' ORDER BY \\"createdAt\\" DESC LIMIT 1""")
with sync_playwright() as p:
    br=p.chromium.launch(); c=br.new_context(viewport={"width":1366,"height":900}); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    # ── Sales: order for 10,000 preforms
    login(pg,"demo.sales"); pg.goto(B+"/orders/new")
    combo(pg,"customerId",cust); pg.fill("#requestedDeliveryDate","2026-11-05")
    combo(pg,"productId[]",prod_code); pg.locator('input[name="quantity[]"]').first.fill("10000"); btn(pg,"Save & confirm")
    pg.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); order_url=pg.url; oid=order_url.split("/")[-1]
    onum=re.search(r"ORD-\d{4}-\d{4}", pg.inner_text("main")).group(0); print("   order", onum)
    pg.goto(B+f"/schedule?view=week&date=2026-10-22&new=1"); combo(pg,"orderLineId",onum); combo(pg,"machineId",mach)
    pg.fill("#plannedStart","2026-10-22T15:00"); pg.fill("#plannedEnd","2026-10-23T23:00"); pg.fill("#plannedQty","10000"); btn(pg,"Schedule")
    if pg.locator("input[name=acknowledge]").count(): pg.check("input[name=acknowledge]"); btn(pg,"Save with these issues")
    jid=sql(f"SELECT j.id FROM \\\"ProductionJob\\\" j JOIN \\\"OrderLine\\\" l ON l.id=j.\\\"orderLineId\\\" WHERE l.\\\"orderId\\\"='{oid}'")
    # ── Production: 6,000 then 4,000 in a second batch
    login(pg,"demo.production"); pg.goto(B+f"/production/{jid}"); btn(pg,"Start job")
    pg.fill("#qtyGood","6000"); btn(pg,"Add quantity"); btn(pg,"New batch"); pg.fill("#qtyGood","4000"); btn(pg,"Add quantity")
    btn(pg,"Complete job"); pg.get_by_role("button", name="Complete job").last.click(); pg.wait_for_timeout(1200)
    (b1,n1),(b2,n2)=[r.split("|") for r in sql(f"SELECT id||'|'||number FROM \\\"Batch\\\" WHERE \\\"jobId\\\"='{jid}' ORDER BY \\\"createdAt\\\"").split("\n")]
    # ── QC holds batch 2
    login(pg,"demo.qc"); pg.goto(B+f"/qc/batches/{b2}"); pg.check("input[value=HOLD]", force=True)
    pg.fill("#qtyInspected","40"); pg.fill("#qtyAccepted","34"); pg.fill("#qtyRejected","6"); pg.select_option("#categoryId", label="Incorrect dimensions")
    pg.fill("#issueDescription","Neck diameter out of tolerance"); btn(pg,"Save — Hold")
    # ── Warehouse receives
    login(pg,"demo.warehouse"); pg.goto(B+"/inventory?tab=awaiting"); t=pg.inner_text("main")
    ck("both batches awaiting receipt", n1 in t and n2 in t)
    pg.goto(B+f"/inventory?tab=awaiting&batch={b1}"); btn(pg,"Confirm receipt")
    ck(f"{n1}: 6,000 received as available", bal(b1).get("AVAILABLE")==6000)
    pg.goto(B+f"/inventory?tab=awaiting&batch={b2}"); btn(pg,"Confirm receipt")
    ck(f"{n2} (on hold): 4,000 went straight to quarantine", bal(b2).get("QUARANTINE")==4000 and bal(b2).get("AVAILABLE",0)==0)
    ck("receipt message mentions quarantine", "quarantine" in pg.inner_text("main"))
    rcount=int(sql(f"SELECT count(*) FROM \\\"WarehouseReceipt\\\" WHERE \\\"batchId\\\" IN ('{b1}','{b2}')"))
    ck("exactly two receipts (no duplicates)", rcount==2)
    ck(f"{n1} no longer awaiting (can't be received twice)", n1 not in pg.locator("main ul").first.inner_text() if pg.locator("main ul").count() else True)
    # ── Shipment 1: held batch can't be selected; ship 2,500
    pg.goto(B+f"/shipments/new?order={oid}")
    ck("held batch input is disabled", pg.locator(f"input[name='qty_{b2}']").is_disabled())
    pg.fill(f"input[name='qty_{b1}']","2500"); btn(pg,"Reserve stock & create shipment")
    s1=pg.url.split("/")[-1]; ck("draft reserves 2,500", bal(b1).get("RESERVED")==2500 and bal(b1).get("AVAILABLE")==3500)
    btn(pg,"Confirm dispatch"); ck("shipment 1 dispatched", "Dispatched" in pg.inner_text("main"))
    ck("order partially delivered", sql(f"SELECT status FROM \\\"Order\\\" WHERE id='{oid}'")=="PARTIALLY_DELIVERED")
    # ── Draft 2 then QC holds batch 1 AFTER reservation → dispatch refused, nothing changes
    pg.goto(B+f"/shipments/new?order={oid}"); pg.fill(f"input[name='qty_{b1}']","3500"); btn(pg,"Reserve stock & create shipment"); s2=pg.url.split("/")[-1]
    login(pg,"demo.qc"); pg.goto(B+f"/qc/batches/{b1}"); pg.check("input[value=HOLD]", force=True); pg.fill("#qtyInspected","20"); pg.fill("#qtyAccepted","20")
    pg.select_option("#categoryId", label="Contamination / black specks"); pg.fill("#issueDescription","Customer complaint check"); btn(pg,"Save — Hold")
    ck("hold moved the reserved 3,500 to quarantine", bal(b1).get("QUARANTINE")==3500 and bal(b1).get("RESERVED",0)==0)
    login(pg,"demo.warehouse"); pg.goto(B+f"/shipments/{s2}"); ck("draft shows QC warning", "blocked" in pg.inner_text("main"))
    shipped_before=bal(b1).get("SHIPPED")
    btn(pg,"Confirm dispatch"); ck("dispatch of held goods refused", "Quality Control" in pg.inner_text("main") and bal(b1).get("SHIPPED")==shipped_before)
    pg.fill("input[placeholder='Reason for cancelling']","QC hold") if pg.locator("input[placeholder='Reason for cancelling']").count() else None
    btn(pg,"Cancel shipment"); pg.fill("input[placeholder='Reason for cancelling']","QC hold on batch"); btn(pg,"Cancel shipment")
    ck("draft cancelled, held stock stays in quarantine", sql(f"SELECT status FROM \\\"Shipment\\\" WHERE id='{s2}'")=="CANCELLED" and bal(b1).get("QUARANTINE")==3500)
    # ── QC releases both batches
    login(pg,"demo.qc")
    for b in (b1,b2):
        pg.goto(B+f"/qc/batches/{b}"); pg.fill("#qtyInspected","100"); pg.fill("#qtyAccepted","100"); btn(pg,"Save — Approve")
    ck("approval returned stock to available (3,500 + 4,000)", bal(b1).get("AVAILABLE")==3500 and bal(b2).get("AVAILABLE")==4000)
    # ── Final shipment: oldest-first fill covers the remaining 7,500
    login(pg,"demo.warehouse"); pg.goto(B+f"/shipments/new?order={oid}"); btn(pg,"Fill oldest first")
    ck("FIFO filled 3,500 + 4,000", pg.input_value(f"input[name='qty_{b1}']")=="3500" and pg.input_value(f"input[name='qty_{b2}']")=="4000")
    btn(pg,"Reserve stock & create shipment"); s3=pg.url.split("/")[-1]; pg.fill("input[dir=ltr] >> nth=0","DN-TEST-77") if False else None
    btn(pg,"Confirm dispatch")
    ck("order fully DELIVERED from shipments", sql(f"SELECT status FROM \\\"Order\\\" WHERE id='{oid}'")=="DELIVERED")
    shipped=int(sql(f"SELECT COALESCE(SUM(qty),0) FROM \\\"StockMovement\\\" WHERE state='SHIPPED' AND \\\"batchId\\\" IN ('{b1}','{b2}')"))
    lines=int(sql(f"SELECT COALESCE(SUM(sl.qty),0) FROM \\\"ShipmentLine\\\" sl JOIN \\\"Shipment\\\" s ON s.id=sl.\\\"shipmentId\\\" WHERE s.\\\"orderId\\\"='{oid}' AND s.status='CONFIRMED'"))
    onhand=sum(v for k,v in bal(b1).items() if k!="SHIPPED")+sum(v for k,v in bal(b2).items() if k!="SHIPPED")
    ck(f"consistent: ledger shipped {shipped} = shipment lines {lines} = ordered 10000, on hand {onhand}", shipped==lines==10000 and onhand==0)
    pg.goto(B+f"/print/shipments/{s3}"); ck("delivery note prints with logo and total", "10,000" not in pg.inner_text("main") and "7,500" in pg.inner_text("main") and pg.locator("img[alt='Bereket Plastic']").count()==1)
    pg.screenshot(path=O+"s6-delivery-note.png", full_page=True)
    pg.goto(order_url); pg.screenshot(path=O+"s6-order-delivered.png", full_page=True)
    ck("order page shows Delivered and both shipments", "Delivered" in pg.inner_text("main") and pg.inner_text("main").count("SHP-")>=2)
    # ── Permissions: production can't create shipments or receive
    login(pg,"demo.production"); pg.goto(B+"/shipments/new"); ck("production blocked from creating shipments", "forbidden" in pg.url)
    pg.goto(B+"/inventory?tab=awaiting"); ck("production sees warehouse read-only (no receive form)", pg.locator("text=Confirm receipt").count()==0)
    ck("no JS errors", not errs)
    c.close(); br.close()
print(f"\n{sum(res)}/{len(res)} passed")
