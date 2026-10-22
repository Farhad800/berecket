import re, time
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/e2e/"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def login(pg,u,pw):
    pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.wait_for_load_state("networkidle")
def combo(pg, name, text, nth=0):
    pg.locator(f'[id="{name}"]').nth(nth).click(); pg.keyboard.type(text); pg.wait_for_timeout(150); pg.keyboard.press("Enter")
def submit(pg, label):
    pg.get_by_role("button", name=label, exact=True).click()
stamp=str(int(time.time()))[-5:]
with sync_playwright() as p:
    br=p.chromium.launch()
    # ── admin sets up master data
    c=br.new_context(viewport={"width":1366,"height":900}); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    login(pg,"admin","Bereket2026Admin")
    pg.goto(B+"/customers"); pg.click("text=New customer"); pg.fill("#name",f"Duhok Water Co {stamp}"); pg.fill("#phone","0750 000 0000"); submit(pg,"Save")
    pg.wait_for_selector(f"text=Duhok Water Co {stamp}"); ck("customer created with auto code", pg.locator("text=/CUS-\\d{4}/").count()>0)
    for code,name in [(f"CAP28-{stamp}","28mm bottle cap"),(f"PF500-{stamp}","500ml preform")]:
        pg.goto(B+"/products"); pg.click("text=New product"); pg.fill("#code",code); pg.fill("#name",name); pg.fill("#cycleTimeSec","20"); submit(pg,"Save"); pg.wait_for_selector(f"text={code.upper()}")
    ck("two products created", True)
    for code in [f"T{stamp}A", f"T{stamp}B"]:
        pg.goto(B+"/assets"); pg.click("text=New machine"); pg.fill("#code",code); pg.fill("#name","Toyo Si-180"); pg.select_option("#status","AVAILABLE"); submit(pg,"Save"); pg.wait_for_selector(f"text={code.upper()}")
    pg.goto(B+"/assets?tab=molds"); pg.click("text=New mold"); pg.fill("#code",f"MD{stamp}"); pg.fill("#name","Cap mold 8-cav"); pg.fill("#cavities","8"); combo(pg,"productId",f"CAP28-{stamp}"); submit(pg,"Save"); pg.wait_for_selector(f"text=MD{stamp}")
    ck("machines and mold created", True)
    ck("no JS errors (master data)", not errs)
    c.close()

    # ── sales creates a 2-product order and confirms it
    c=br.new_context(viewport={"width":1366,"height":900}); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    login(pg,"demo.sales","Demo12345!")
    pg.goto(B+"/orders/new")
    combo(pg,"customerId",f"Duhok Water Co {stamp}")
    pg.fill("#requestedDeliveryDate","2026-10-30"); pg.select_option("#priority","HIGH")
    combo(pg,"productId[]",f"CAP28-{stamp}",0); pg.locator('input[name="quantity[]"]').nth(0).fill("50000")
    pg.click("text=Add product"); combo(pg,"productId[]",f"PF500-{stamp}",1); pg.locator('input[name="quantity[]"]').nth(1).fill("12000")
    submit(pg,"Save & confirm"); pg.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
    order_url=pg.url; body=pg.inner_text("main")
    ck("order created with 2 lines", f"CAP28-{stamp}" in body and f"PF500-{stamp}" in body)
    ck("confirmed order waits for planning", "Waiting for planning" in body)
    num=re.search(r"ORD-\d{4}-\d{4}", body).group(0); print("   order", num)
    # date change without reason refused; with reason accepted
    pg.goto(order_url+"/edit"); pg.fill("#requestedDeliveryDate","2026-11-02"); submit(pg,"Save")
    pg.wait_for_selector("[role=status]"); ck("date change without reason refused", "reason" in pg.inner_text("[role=status]"))
    pg.fill("#reason","Customer asked for later delivery"); submit(pg,"Save"); pg.wait_for_url(order_url, wait_until="commit"); pg.wait_for_load_state("networkidle")
    ck("date change with reason saved + in history", "Delivery date changed" in pg.inner_text("main"))
    # hold needs reason, then resume
    pg.click("text=Put on hold"); pg.fill("input[placeholder='Reason (required)']","Waiting for customer artwork"); pg.get_by_role("button", name="Confirm", exact=True).click()
    pg.wait_for_selector("text=On hold"); ck("order put on hold", True)
    pg.click("text=Resume"); pg.wait_for_selector("text=Waiting for planning"); ck("order resumed → recalculated status", True)
    c.close()

    # ── planner schedules: clash detected, then fixed
    c=br.new_context(viewport={"width":1440,"height":900}); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    login(pg,"demo.sales","Demo12345!")
    pg.goto(B+"/schedule?view=week&date=2026-10-24&new=1")
    combo(pg,"orderLineId",f"{num} · 28mm"); combo(pg,"machineId",f"T{stamp}A"); combo(pg,"moldId",f"MD{stamp}")
    pg.fill("#plannedStart","2026-10-24T07:00"); pg.fill("#plannedEnd","2026-10-25T07:00"); pg.fill("#plannedQty","50000")
    submit(pg,"Schedule"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(800)
    txt=pg.inner_text("main")
    if "Check before saving" in txt:
        print("   warnings:", re.findall(r"Needs about[^\n]*|Finishes after[^\n]*", txt))
        pg.check("input[name=acknowledge]"); pg.click("text=Save with these issues"); pg.wait_for_timeout(1500)
    ck("job 1 scheduled", pg.locator(f"a[title*='{num}']").count()>0)
    # overlapping second job on same machine → blocked
    pg.goto(B+"/schedule?view=week&date=2026-10-24&new=1")
    combo(pg,"orderLineId",f"{num} · 500ml"); combo(pg,"machineId",f"T{stamp}A")
    pg.fill("#plannedStart","2026-10-24T15:00"); pg.fill("#plannedEnd","2026-10-24T23:00"); pg.fill("#plannedQty","12000")
    submit(pg,"Schedule"); pg.wait_for_selector("text=Check before saving")
    ck("machine clash detected, nothing saved", "already booked" in pg.inner_text("main") and pg.locator(f"a[title*='PF500-{stamp}']").count()==0)
    pg.screenshot(path=O+"s2-conflict.png", full_page=True)
    # move to the free machine
    combo(pg,"machineId",f"T{stamp}B"); submit(pg,"Save with these issues"); pg.wait_for_timeout(1500)
    if "Check before saving" in pg.inner_text("main") and pg.locator("input[name=acknowledge]").count():
        pg.check("input[name=acknowledge]"); pg.click("text=Save with these issues"); pg.wait_for_timeout(1500)
    ck("job 2 scheduled on free machine", pg.locator(f"a[title*='PF500-{stamp}']").count()>0)
    pg.screenshot(path=O+"s2-schedule-week.png", full_page=True)
    pg.goto(order_url); ck("fully planned order → Scheduled", "Scheduled" in pg.inner_text("main"))
    pg.screenshot(path=O+"s2-order-detail.png", full_page=True)
    ck("no JS errors (sales/schedule)", not errs)
    c.close()

    # ── production user: can view, cannot create orders or schedule
    c=br.new_context(**p.devices["Pixel 7"]); pg=c.new_page()
    login(pg,"demo.production","Demo12345!")
    pg.goto(B+"/orders"); ck("production sees orders list", num in pg.inner_text("main"))
    ck("production has no 'New order' button", pg.locator("text=New order").count()==0)
    pg.goto(B+"/orders/new"); ck("production blocked from /orders/new", "forbidden" in pg.url)
    pg.goto(order_url); ck("production sees order but no edit/hold buttons", pg.get_by_role("button", name="Put on hold").count()==0 and pg.get_by_role("link", name="Edit").count()==0)
    pg.screenshot(path=O+"s2-order-mobile.png", full_page=True)
    pg.goto(B+"/schedule"); ck("production has no 'Schedule job' button", pg.locator("text=Schedule job").count()==0)
    c.close()

    # ── Arabic schedule on tablet
    c=br.new_context(viewport={"width":1024,"height":768}); pg=c.new_page()
    login(pg,"demo.sales","Demo12345!"); pg.goto(B+"/login")
    c.add_cookies([{"name":"bfms_locale","value":"ar","url":B}])
    pg.goto(B+"/schedule?view=week&date=2026-10-24"); pg.wait_for_timeout(800)
    ck("Arabic schedule renders RTL", pg.evaluate("document.documentElement.dir")=="rtl")
    pg.screenshot(path=O+"s2-schedule-ar.png", full_page=True)
    c.close()
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
