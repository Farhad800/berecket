import re, subprocess, urllib.request
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/e2e/"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d bereket -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.wait_for_load_state("networkidle")
def combo(pg, name, text):
    pg.locator(f'[id="{name}"]').first.click(); pg.keyboard.type(text); pg.wait_for_timeout(150); pg.keyboard.press("Enter")
def btn(pg,name,exact=True): pg.get_by_role("button", name=name, exact=exact).first.click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(700)
mach_code, mach_id = sql("""SELECT code||'|'||id FROM \\"Machine\\" WHERE code LIKE 'T%B' ORDER BY \\"createdAt\\" DESC LIMIT 1""").split("|")
mold_code = sql("""SELECT code FROM \\"Mold\\" ORDER BY \\"createdAt\\" DESC LIMIT 1""")
print("   machine", mach_code, "mold", mold_code)
with sync_playwright() as p:
    br=p.chromium.launch(); c=br.new_context(viewport={"width":1280,"height":900}); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    # Production reports a problem
    login(pg,"demo.production")
    pg.goto(B+"/service/requests/new"); combo(pg,"machineId",mach_code); pg.fill("#title","Nozzle heater band not heating"); pg.fill("#description","Zone 1 stays at 40°C")
    pg.select_option("#priority","URGENT"); pg.check("input[name=machineDown]"); btn(pg,"Send request")
    rid=pg.url.rstrip("/").split("/")[-1]; num=re.search(r"MR-\d{4}-\d{4}", pg.inner_text("main")).group(0); print("   request", num)
    ck("request created, machine DOWN", sql(f"SELECT status FROM \\\"Machine\\\" WHERE id='{mach_id}'")=="DOWN")
    # Service gets notified, works it
    login(pg,"demo.service")
    pg.goto(B+"/notifications"); ck("technician notified of new request", num in pg.inner_text("main"))
    pg.goto(B+f"/service/requests/{rid}"); btn(pg,"Start work")
    ck("work started → machine MAINTENANCE", sql(f"SELECT status FROM \\\"Machine\\\" WHERE id='{mach_id}'")=="MAINTENANCE")
    with pg.expect_file_chooser() as fc: pg.click("text=Add photo or PDF")
    fc.value.set_files(O+"leak-photo.jpg"); pg.wait_for_selector("main img[src^='/api/files/']", timeout=20000)
    size=int(sql(f"SELECT size FROM \\\"Attachment\\\" WHERE \\\"entityId\\\"='{rid}' ORDER BY \\\"createdAt\\\" DESC LIMIT 1") or 0)
    ck(f"photo uploaded and shrunk on the phone side ({size//1024} KB)", 0 < size < 600_000)
    fid=pg.locator("main img[src^='/api/files/']").first.get_attribute("src")
    btn(pg,"Waiting for parts"); ck("waiting for parts", "Waiting for parts" in pg.inner_text("main"))
    btn(pg,"Start work")
    # Daily report with mold change
    pg.goto(B+f"/service/reports/new?request={rid}&machine={mach_id}")
    pg.fill("#workPerformed","Replaced heater band zone 1, checked thermocouple"); combo(pg,"moldInstalledId",mold_code)
    pg.fill("#moldChangeReason","Next job on this machine needs it"); pg.fill("#spareParts","Heater band 60x50 230V"); pg.fill("#downtimeMinutes","45"); btn(pg,"Save report")
    ck("service report saved", re.search(r"SR-\d{4}-\d{4}", pg.inner_text("main")) is not None)
    ck("mold now recorded on this machine", sql(f"SELECT m.code FROM \\\"Mold\\\" m WHERE m.\\\"currentMachineId\\\"='{mach_id}'")==mold_code)
    pg.goto(B+f"/service/requests/{rid}"); btn(pg,"Repair completed")
    pg.fill("textarea[placeholder='What was repaired or replaced?']","Heater band replaced, temperatures normal"); btn(pg,"Confirm")
    ck("repair completed → machine AVAILABLE", sql(f"SELECT status FROM \\\"Machine\\\" WHERE id='{mach_id}'")=="AVAILABLE")
    ck("technician can't verify own work", pg.get_by_role("button", name="Verify").count()==0)
    # Production told the machine is ready
    login(pg,"demo.production"); pg.goto(B+"/notifications"); ck("production notified machine ready", "ready to run again" in pg.inner_text("main"))
    # QC verifies
    login(pg,"demo.qc"); pg.goto(B+f"/service/requests/{rid}"); btn(pg,"Verify"); ck("verified by QC", "Verified" in pg.inner_text("main"))
    pg.screenshot(path=O+"s4-request.png", full_page=True)
    # File security
    anon=p.request.new_context()
    r1=anon.get(B+fid, max_redirects=0); r2=anon.get(B+fid, headers={"Cookie":"bfms_session=forged"}, max_redirects=0)
    ck("photo blocked without sign-in (redirect / 401, no image bytes)", r1.status in (307,401) and r2.status==401 and "image" not in r2.headers.get("content-type",""))
    ck("signed-in viewer can open photo", pg.request.get(B+fid).status==200)
    # Preventive
    login(pg,"demo.service"); pg.goto(B+"/service?tab=preventive"); pg.click("text=New preventive task")
    pg.fill("#title","Grease toggle links"); combo(pg,"machineId",mach_code); pg.fill("#intervalDays","14"); pg.fill("#nextDueAt","2026-10-01"); btn(pg,"Save")
    ck("preventive task shows overdue", "Overdue" in pg.inner_text("main"))
    btn(pg,"Mark done"); ck("marked done → back on schedule", "On schedule" in pg.inner_text("main"))
    # History
    pg.goto(B+f"/history?machine={mach_id}"); txt=pg.inner_text("main")
    ck("machine history shows mold change, request and downtime", "Mold change" in txt and "Nozzle heater" in txt and "45 min" in txt)
    pg.screenshot(path=O+"s4-history.png", full_page=True)
    ck("no JS errors", not errs)
    c.close(); br.close()
print(f"\n{sum(res)}/{len(res)} passed")
