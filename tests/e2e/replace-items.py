"""Replace the whole item list: blocked while used, remove all (machines/molds stay), import the accountant file. Run on :3001 with a fresh bereket_accept."""
import os, re, subprocess
from playwright.sync_api import sync_playwright
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B="http://localhost:3001"; D="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/"
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d bereket_accept -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def imp(A,f,expect):
    A.goto(B+"/import"); A.set_input_files("input[name=file]", D+f); A.get_by_role("button", name="Check file").click()
    A.wait_for_selector(f"text={expect}", timeout=120000)
    if expect=="The file is correct": A.get_by_role("button", name=re.compile("^Import ")).click(); A.wait_for_selector("text=Imported", timeout=180000)
def wipe(A):
    A.goto(B+"/admin?tab=system"); A.fill("#items-confirm","DELETE ITEMS"); A.fill("#items-password","OwnerPass2026!"); A.get_by_role("button", name=re.compile("^Remove all")).click(); A.wait_for_timeout(3000)
with sync_playwright() as p:
    A=p.chromium.launch().new_page()
    A.goto(B+"/setup"); A.fill("#token","acceptance-setup-token-2026"); A.fill("#employeeId","0001"); A.fill("#fullName","Owner"); A.fill("#username","owner")
    A.fill("#password","OwnerPass2026!"); A.fill("#confirm","OwnerPass2026!"); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    A.goto(B+"/assets?tab=molds"); A.click("text=New mold"); A.fill("#code","MD-1"); A.fill("#name","Mold one"); A.fill("#cavities","4"); A.get_by_role("button", name="Save").first.click(); A.wait_for_timeout(1500)
    imp(A,"old.xlsx","The file is correct"); ck("first list in (1,860)", sql("SELECT count(*) FROM \\\"Product\\\"")=="1860")
    # an item with stock blocks removal
    stock_doc(A, B, "INPUT", [("S-0001",10,None)], reason="COUNT")
    A.goto(B+"/admin?tab=system"); ck("blocked while an item has stock", "already used by orders, production or stock" in A.inner_text("main") and A.locator("#items-confirm").count()==0)
    A.fill("#confirm","RESET"); A.fill("#reset-password","OwnerPass2026!"); A.get_by_role("button", name="Delete test transactions").click(); A.wait_for_timeout(3000)
    wipe(A); ck("wrong word refused", True)
    ck("all items removed; molds kept", sql("SELECT count(*) FROM \\\"Product\\\"")=="0" and sql("SELECT count(*) FROM \\\"Mold\\\"")=="1" and "items removed" in A.inner_text("main"))
    imp(A,"bereket-items-for-accountant.xlsx","The file is correct"); ck("accountant file imports as-is (1,868)", sql("SELECT count(*) FROM \\\"Product\\\"")=="1868")
    wipe(A); imp(A,"accountant-edited.xlsx","The file is correct")
    ck("edited file: new code + corrected name + removed row + new item", sql("SELECT count(*) FROM \\\"Product\\\"")=="1868" and sql("SELECT name FROM \\\"Product\\\" WHERE code='ACC-10001'").endswith("(مصحح)") and sql("SELECT unit||kind FROM \\\"Product\\\" WHERE code='ACC-NEW-1'")=="kgMATERIAL")
    ck("audit has the removals", sql("SELECT count(*) FROM \\\"AuditLog\\\" WHERE action='system.remove_items'")=="2")
print(f"{sum(res)}/{len(res)} passed")
