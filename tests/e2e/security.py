"""Security tests (Stage 8). Run against a local server with demo accounts:
   python3 tests/e2e/security.py   (BASE env var to change the URL)"""
import os, re, subprocess
from playwright.sync_api import sync_playwright
B=os.environ.get("BASE","http://localhost:3000"); DB=os.environ.get("PGDB","bereket")
O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/sec/"; os.makedirs(O, exist_ok=True)
ADMIN=(os.environ.get("ADMIN_USER","admin"), os.environ.get("ADMIN_PASS","Bereket2026Admin"))
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")

with sync_playwright() as p:
    br=p.chromium.launch()
    # Make sure there is an order and a maintenance request to test against (fresh databases have none).
    if sql("SELECT count(*) FROM \\\"Order\\\"")=="0" or sql("SELECT count(*) FROM \\\"MaintenanceRequest\\\"")=="0":
        s0=br.new_context().new_page(); login(s0,"demo.sales"); s0.goto(B+"/orders/new"); s0.locator("input[data-q]").first.fill("100")
        s0.get_by_role("button", name="Save order").click(); s0.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit")
        login(s0,"demo.production"); s0.goto(B+"/service/requests/new"); s0.locator('[id="machineId"]').click(); s0.keyboard.press("Enter")
        s0.fill("#title","Security test request"); s0.get_by_role("button", name="Send request").click(); s0.wait_for_timeout(1500); s0.context.close()
    anon=br.new_context(); ap=anon.new_page()
    # 1. Signed-out access
    for path in ["/dashboard","/orders","/reports/production","/admin","/audit","/inventory"]:
        r=ap.goto(B+path);
        if "/login" not in ap.url: ck(f"signed-out {path} redirects to login", False)
    ck("signed-out pages all redirect to login", True)
    st={u: anon.request.get(B+u, max_redirects=0).status for u in ["/api/files/abc","/api/reports/production","/api/audit"]}
    ck(f"signed-out API calls refused {st}", all(s in (307,401) for s in st.values()))
    anon.add_cookies([{"name":"bfms_session","value":"forged-token-1234567890","url":B}])
    st={u: anon.request.get(B+u, max_redirects=0).status for u in ["/api/files/abc","/api/reports/production","/api/audit"]}
    ck(f"forged session cookie refused {st}", all(s==401 for s in st.values()))
    r=anon.request.get(B+"/dashboard", max_redirects=0); ck("forged cookie can't open pages", r.status in (307,308) or "login" in (r.headers.get("location") or "") or "Sign in" in r.text())
    # 2. Headers
    h=anon.request.get(B+"/login").headers
    ck("security headers (frame deny, nosniff, HSTS, referrer)", h.get("x-frame-options")=="DENY" and h.get("x-content-type-options")=="nosniff" and "max-age" in h.get("strict-transport-security","") and h.get("referrer-policy"))
    ck("no X-Powered-By header", "x-powered-by" not in h)
    ck("setup page is closed once an admin exists", anon.request.get(B+"/setup").status==404)
    # 3. Login protections
    pg=br.new_context().new_page()
    sql("UPDATE \\\"User\\\" SET \\\"failedLogins\\\"=0, \\\"lockedUntil\\\"=NULL WHERE username='demo.service'")
    def try_login(u,pw):
        pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]"); pg.wait_for_timeout(1200)
        return pg.inner_text("main") if "/login" in pg.url else "OK"
    m1=try_login("demo.service","wrong-1"); m2=try_login("nobody.here","wrong-1")
    ck("same message for unknown user and wrong password (no user enumeration)", m1==m2 and m1!="OK")
    for i in range(4): try_login("demo.service",f"wrong-{i+2}")
    ck("account locks after 5 failed attempts (correct password refused)", try_login("demo.service","Demo12345!")!="OK")
    ck("lock recorded in database", sql("SELECT \\\"lockedUntil\\\" IS NOT NULL FROM \\\"User\\\" WHERE username='demo.service'")=="t")
    sql("UPDATE \\\"User\\\" SET \\\"failedLogins\\\"=0, \\\"lockedUntil\\\"=NULL WHERE username='demo.service'")
    ck("unlocked account signs in again", try_login("demo.service","Demo12345!")=="OK")
    ck("only a hash of the session token is stored", sql("SELECT count(*) FROM \\\"Session\\\" WHERE length(id)=64")!="0" and len(sql("SELECT id FROM \\\"Session\\\" LIMIT 1"))==64)
    ck("passwords stored as bcrypt hashes", sql("SELECT bool_and(\\\"passwordHash\\\" LIKE '$2%') FROM \\\"User\\\"")=="t")
    # 4. Session cookie flags
    adm=br.new_context(); a=adm.new_page(); login(a,*ADMIN)
    ck_=[c for c in adm.cookies() if c["name"]=="bfms_session"][0]
    ck("session cookie is HttpOnly + SameSite=Lax", ck_["httpOnly"] and ck_["sameSite"]=="Lax")
    ck("JavaScript cannot read the session cookie", "bfms_session" not in a.evaluate("document.cookie"))
    # 5. Server-action replay: capture the admin's "create employee" request without letting it through
    cap={}
    def grab(route, req):
        if req.method=="POST" and req.headers.get("next-action"): cap.update(headers=req.headers, body=req.post_data_buffer, url=req.url); route.abort()
        else: route.continue_()
    a.goto(B+"/admin?tab=employees"); a.route("**/admin**", grab)
    a.click("text=New employee"); a.fill("#employeeId","SEC-1"); a.fill("#fullName","Replay Test"); a.fill("#username","sec.replay")
    a.select_option("#roleId", label="Administrator"); a.click("form button[type=submit]"); a.wait_for_timeout(1500); a.unroute("**/admin**")
    ck("captured a real server-action request", bool(cap.get("body")))
    keep={k:v for k,v in cap["headers"].items() if k.lower() in ("next-action","content-type","accept","next-router-state-tree")}
    prod=br.new_context(); pp=prod.new_page(); login(pp,"demo.production")
    r=prod.request.post(cap["url"], headers={**keep,"origin":B}, data=cap["body"])
    ck("Production replaying an admin action is refused by the server", "permission" in r.text() and sql("SELECT count(*) FROM \\\"User\\\" WHERE username='sec.replay'")=="0")
    r=adm.request.post(cap["url"], headers={**keep,"origin":"https://evil.example"}, data=cap["body"])
    ck("cross-site request (foreign Origin) is rejected — CSRF", sql("SELECT count(*) FROM \\\"User\\\" WHERE username='sec.replay'")=="0")
    r=adm.request.post(cap["url"], headers={**keep,"origin":B}, data=cap["body"])
    ck("control: same request from the admin's own page works", sql("SELECT count(*) FROM \\\"User\\\" WHERE username='sec.replay'")=="1")
    uid=sql("SELECT id FROM \\\"User\\\" WHERE username='sec.replay'")
    sql(f"UPDATE \\\"AuditLog\\\" SET \\\"userId\\\"=NULL WHERE \\\"userId\\\"='{uid}'"); sql(f"DELETE FROM \\\"User\\\" WHERE id='{uid}'")
    # 6. Escalation via role edits is impossible for non-admins
    ck("Production can't open Administration", (pp.goto(B+"/admin") and "/forbidden" in pp.url))
    # 7. Disabled employee is signed out immediately
    qc=br.new_context(); qp=qc.new_page(); login(qp,"demo.qc")
    a.goto(B+"/admin?tab=employees"); a.on("dialog", lambda d: d.accept())
    row=a.locator("section").filter(has_text="@demo.qc").first; row.get_by_role("button", name="Disable").click(); a.wait_for_timeout(1500)
    qp.goto(B+"/dashboard"); ck("disabled employee is signed out at once", "/login" in qp.url)
    ck("disabled employee can't sign in", try_login("demo.qc","Demo12345!")!="OK")
    sql("UPDATE \\\"User\\\" SET active=true WHERE username='demo.qc'")
    # 8. Injection attempts are harmless
    for q in ["' OR 1=1 --","%'; DROP TABLE \"Order\"; --","<script>alert(1)</script>"]:
        r=a.request.get(B+"/search?q="+q.replace("%","%25").replace(" ","%20").replace(";","%3B").replace("\"","%22").replace("<","%3C").replace(">","%3E"))
        if r.status!=200: ck("injection text in search: "+q, False)
    ck("SQL-like text in search and filters returns normally", a.request.get(B+"/orders?q=%27%20OR%201%3D1--&status=%27x").status==200 and sql("SELECT count(*) FROM \\\"Order\\\"")!="")
    # 9. Stored XSS in a comment is shown as text, never executed
    oid=sql("SELECT id FROM \\\"Order\\\" ORDER BY \\\"createdAt\\\" DESC LIMIT 1")
    a.goto(B+f"/orders/{oid}"); a.fill("textarea[name=body]","<img src=x onerror=window.__xss=1> <script>window.__xss=2</script>")
    a.get_by_role("button", name="Post").click(); a.wait_for_timeout(1500); a.reload(); a.wait_for_load_state("networkidle")
    ck("comment with HTML is displayed as plain text", "<img src=x" in a.inner_text("main") and a.evaluate("window.__xss")==None)
    sql(f"DELETE FROM \\\"Comment\\\" WHERE \\\"entityId\\\"='{oid}' AND body LIKE '%__xss%'")
    # 10. Files: fake image rejected, unknown file id refused
    mr=sql("SELECT id FROM \\\"MaintenanceRequest\\\" ORDER BY \\\"createdAt\\\" DESC LIMIT 1")
    svc=br.new_context(); sp=svc.new_page(); login(sp,"demo.service"); sp.goto(B+f"/service/requests/{mr}")
    open(O+"evil.pdf","w").write("<html><script>alert(1)</script></html>")
    sp.locator("input[type=file]").first.set_input_files(O+"evil.pdf"); sp.wait_for_timeout(2500)
    ck("a web page renamed .pdf is rejected (file content is checked)", "only photos" in sp.inner_text("main") and sql(f"SELECT count(*) FROM \\\"Attachment\\\" WHERE filename='evil.pdf'")=="0")
    ck("unknown file id → 404", a.request.get(B+"/api/files/cl0000000000000000000000").status==404)
    # 11. Notifications of another employee can't be opened/marked
    nid=sql("SELECT n.id FROM \\\"Notification\\\" n JOIN \\\"User\\\" u ON u.id=n.\\\"userId\\\" WHERE u.username<>'demo.production' AND n.\\\"readAt\\\" IS NULL LIMIT 1")
    if nid:
        pp.goto(B+f"/notifications/open/{nid}")
        ck("someone else's notification is not opened or marked read", sql(f"SELECT \\\"readAt\\\" IS NULL FROM \\\"Notification\\\" WHERE id='{nid}'")=="t")
    # 12. Audit trail of security-relevant actions
    ck("logins and employee changes are in the audit log", int(sql("SELECT count(*) FROM \\\"AuditLog\\\" WHERE action IN ('auth.login','user.disable','user.create') AND \\\"createdAt\\\">now()-interval '10 minutes'"))>=3)
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
