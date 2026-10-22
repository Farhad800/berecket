import subprocess
from playwright.sync_api import sync_playwright
B="http://localhost:3000"
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d bereket -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
bid=sql("""SELECT id FROM \\"Batch\\" ORDER BY \\"createdAt\\" LIMIT 1""")
before=int(sql(f"SELECT count(*) FROM \\\"QualityIssue\\\" WHERE \\\"batchId\\\"='{bid}'"))
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page(viewport={"width":1280,"height":900})
    pg.goto(B+"/login"); pg.fill("#username","demo.qc"); pg.fill("#password","Demo12345!"); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit")
    pg.goto(B+f"/qc/batches/{bid}"); pg.check("input[value=HOLD]", force=True); pg.fill("#qtyInspected","30"); pg.fill("#qtyAccepted","25"); pg.fill("#qtyRejected","5")
    pg.select_option("#categoryId", label="Color mismatch"); pg.fill("#issueDescription","Shade lighter than master sample"); pg.get_by_role("button", name="Save — Hold").click(); pg.wait_for_timeout(1500)
    pg.check("input[value=PARTIAL]", force=True)
    shown = pg.locator("text=This decision continues open issue").count()==1 and pg.locator("#issueDescription").count()==0
    pg.fill("#qtyInspected","19500"); pg.fill("#qtyAccepted","19000"); pg.fill("#qtyRejected","500"); pg.get_by_role("button", name="Save — Partial release").click(); pg.wait_for_timeout(1500)
    after=int(sql(f"SELECT count(*) FROM \\\"QualityIssue\\\" WHERE \\\"batchId\\\"='{bid}'")); status=sql(f"SELECT \\\"qcStatus\\\" FROM \\\"Batch\\\" WHERE id='{bid}'")
    print(("PASS" if shown else "FAIL"), "form says it continues the open issue (no defect fields)")
    print(("PASS" if after==before+1 and status=="PARTIAL" else "FAIL"), f"one issue only (+{after-before}), batch {status}")
    br.close()
