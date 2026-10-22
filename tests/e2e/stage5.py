import re, subprocess, uuid
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/e2e/"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d bereket -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.wait_for_load_state("networkidle")
def btn(pg,name,exact=True): pg.get_by_role("button", name=name, exact=exact).first.click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(800)
def bal(bid):
    rows=sql(f"SELECT state||'='||SUM(qty) FROM \\\"StockMovement\\\" WHERE \\\"batchId\\\"='{bid}' GROUP BY state")
    return dict(r.split("=") for r in rows.split("\n") if r)
b1,b2 = [r.split("|") for r in sql("""SELECT b.id||'|'||b.number FROM \\"Batch\\" b ORDER BY b.\\"createdAt\\" LIMIT 2""").split("\n")]
order_id = sql(f"SELECT l.\\\"orderId\\\" FROM \\\"Batch\\\" b JOIN \\\"OrderLine\\\" l ON l.id=b.\\\"orderLineId\\\" WHERE b.id='{b1[0]}'")
print("   batches", b1[1], b2[1])
# Simulate a warehouse receipt of LOT-2 (Stage 6 will do this from the warehouse screen)
pid, lid = sql(f"SELECT \\\"productId\\\"||'|'||\\\"orderLineId\\\" FROM \\\"Batch\\\" WHERE id='{b2[0]}'").split("|")
admin=sql("SELECT id FROM \\\"User\\\" WHERE username='admin'")
sql(f"INSERT INTO \\\"StockMovement\\\" (id,\\\"transactionId\\\",type,\\\"productId\\\",\\\"batchId\\\",\\\"orderLineId\\\",state,qty,\\\"createdById\\\") VALUES ('{uuid.uuid4()}','{uuid.uuid4()}','RECEIPT','{pid}','{b2[0]}','{lid}','AVAILABLE',5000,'{admin}')")
with sync_playwright() as p:
    br=p.chromium.launch(); c=br.new_context(viewport={"width":1280,"height":900}); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    login(pg,"demo.qc")
    pg.goto(B+"/qc"); ck("QC inspect list shows batches", b1[1] in pg.inner_text("main"))
    # Sample approve LOT-1
    pg.goto(B+f"/qc/batches/{b1[0]}"); pg.fill("#qtyInspected","200"); pg.fill("#qtyAccepted","200"); btn(pg,"Save — Approve")
    ck("sample inspection approves batch", sql(f"SELECT \\\"qcStatus\\\" FROM \\\"Batch\\\" WHERE id='{b1[0]}'")=="APPROVED")
    # Hold LOT-2 (already in warehouse) with a defect
    pg.goto(B+f"/qc/batches/{b2[0]}"); pg.check("input[value=HOLD]", force=True)
    pg.fill("#qtyInspected","50"); pg.fill("#qtyAccepted","38"); pg.fill("#qtyRejected","12")
    pg.select_option("#categoryId", label="Flash / excess plastic"); pg.select_option("#severity","MAJOR"); pg.select_option("#responsibleDept","PRODUCTION")
    pg.fill("#issueDescription","Flash on parting line, 12 of 50 caps"); pg.fill("#recommendedAction","Check clamp force and clean parting line")
    btn(pg,"Save — Hold")
    ck("batch on hold", sql(f"SELECT \\\"qcStatus\\\" FROM \\\"Batch\\\" WHERE id='{b2[0]}'")=="HOLD")
    s=bal(b2[0]); ck(f"warehouse stock moved to quarantine {s}", s.get("QUARANTINE")=="5000" and s.get("AVAILABLE","0")=="0")
    issue_id=sql(f"SELECT id FROM \\\"QualityIssue\\\" WHERE \\\"batchId\\\"='{b2[0]}' ORDER BY \\\"createdAt\\\" DESC LIMIT 1")
    ck("quality issue opened", len(issue_id)>10)
    # Full sorting → partial release
    pg.check("input[value=PARTIAL]", force=True); pg.fill("#qtyInspected","5000"); pg.fill("#qtyAccepted","4600"); pg.fill("#qtyRejected","300"); pg.fill("#qtyHold","100")
    pg.select_option("#categoryId", label="Flash / excess plastic"); pg.fill("#issueDescription","Sorted whole batch")
    btn(pg,"Save — Partial release")
    s=bal(b2[0]); ck(f"partial: 4600 available / 100 quarantine / 300 rejected {s}", s.get("AVAILABLE")=="4600" and s.get("QUARANTINE")=="100" and s.get("REJECTED")=="300")
    pg.screenshot(path=O+"s5-batch.png", full_page=True)
    pg.goto(B+f"/orders/{order_id}"); t=pg.inner_text("main")
    ck("order shows 400 held/rejected and 24,100 accepted", "24,100" in t and re.search(r"Held/rejected\s*400", t))
    # Production fixes the cause
    login(pg,"demo.production"); pg.goto(B+f"/qc/batches/{b2[0]}")
    ck("production sees batch read-only", pg.locator("text=Record inspection").count()==0)
    pg.goto(B+f"/qc/issues/{issue_id}"); pg.fill("textarea[name=description]","Raised clamp force 5%, cleaned parting line, first 100 shots OK"); btn(pg,"Save action")
    btn(pg,"Submit for QC verification"); ck("production submitted corrective action", sql(f"SELECT status FROM \\\"QualityIssue\\\" WHERE id='{issue_id}'")=="AWAITING_VERIFICATION")
    ck("production cannot resolve", pg.get_by_role("button", name="Verify & resolve").count()==0)
    login(pg,"demo.warehouse"); pg.goto(B+f"/qc/issues/{issue_id}"); ck("warehouse can't add corrective action", pg.locator("text=Record corrective action").count()==0)
    login(pg,"demo.qc"); pg.goto(B+f"/qc/issues/{issue_id}"); btn(pg,"Verify & resolve")
    ck("QC verified and resolved", sql(f"SELECT status FROM \\\"QualityIssue\\\" WHERE id='{issue_id}'")=="RESOLVED")
    pg.screenshot(path=O+"s5-issue.png", full_page=True)
    login(pg,"demo.warehouse"); pg.goto(B+"/notifications"); ck("warehouse notified of approval and partial release", "approved by QC" in pg.inner_text("main") and "partial release" in pg.inner_text("main"))
    ck("no JS errors", not errs)
    c.close(); br.close()
print(f"\n{sum(res)}/{len(res)} passed")
