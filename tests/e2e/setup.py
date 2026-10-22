from playwright.sync_api import sync_playwright
B="http://localhost:3001"
def ck(n,c): print(("PASS " if c else "FAIL ")+n)
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page()
    pg.goto(B+"/setup")
    pg.fill("#token","wrong-code"); pg.fill("#employeeId","0001"); pg.fill("#fullName","Test Admin"); pg.fill("#username","boss")
    pg.fill("#password","GoodPass2026"); pg.fill("#confirm","GoodPass2026"); pg.click("button[type=submit]")
    pg.wait_for_selector("[role=status]"); ck("wrong setup code refused", "incorrect" in pg.inner_text("[role=status]"))
    ck("form keeps typed values", pg.input_value("#username")=="boss")
    pg.fill("#token","test-setup-token-1234567890"); pg.click("button[type=submit]")
    pg.wait_for_url("**/dashboard", wait_until="commit"); ck("admin created and signed in", True)
    pg2=br.new_page(); r=pg2.goto(B+"/setup"); ck("setup page gone afterwards (404)", r.status==404)
    br.close()
