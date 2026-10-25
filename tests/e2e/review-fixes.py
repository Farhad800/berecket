"""Code-review fixes (26 Oct 2026): password change keeps the session in use; clear message when a record vanished.
   Fresh bereket_accept on :3001, then: python3 tests/e2e/review-fixes.py"""
import os, re, subprocess
from playwright.sync_api import sync_playwright
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
PW="OwnerPass2026!"
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx():
        pg=br.new_context().new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")

    # L5: change the password on the OLDER of two devices → that device stays signed in, the other is signed out
    Old=ctx(); login(Old,"owner",PW)
    New=ctx(); login(New,"owner",PW)
    Old.goto(B+"/change-password"); Old.fill("#current",PW); Old.fill("#next","OwnerPass2027!"); Old.fill("#confirm","OwnerPass2027!"); Old.click("button[type=submit]")
    Old.wait_for_url("**/dashboard", wait_until="commit"); Old.goto(B+"/orders"); Old.wait_for_load_state("networkidle")
    ck("device that changed the password stays signed in", Old.url.endswith("/orders"))
    New.goto(B+"/orders"); New.wait_for_load_state("networkidle")
    ck("other devices are signed out", "/login" in New.url)
    A.goto(B+"/orders"); A.wait_for_load_state("networkidle")
    ck("…including the first device", "/login" in A.url)
    ck("only one session left", sql(f"SELECT count(*) FROM {Q('\"Session\"')}")=="1")

    # L1: archiving a product someone else just deleted → clear message, not "Something went wrong"
    sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('tGONE','P-GONE','Gone product','PRODUCT','pcs',now())")
    Old.goto(B+"/products"); Old.wait_for_load_state("networkidle")
    row=Old.locator("section", has_text="P-GONE").first
    sql(f"DELETE FROM {Q('\"Product\"')} WHERE id='tGONE'")
    row.get_by_role("button", name="Archive", exact=True).click()
    Old.wait_for_timeout(1500); txt=Old.inner_text("main")
    ck("vanished record gives a clear message", "no longer exists" in txt and "Something went wrong" not in txt)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
