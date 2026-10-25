"""M1 (kg precision) and M2 (simultaneous production / QC saves) — reproduces both problems and proves the fixes.

Requests are fired at the SAME moment from several threads straight at the server actions (the way two people,
a double-click or a network retry would arrive), then the database is checked against the stock rules:
  - every production entry has exactly the PRODUCTION movements for its quantity;
  - labels / materials used = what the recipe needs for the entry's quantity (never twice);
  - QC never rejects more pieces than were produced; QC_REJECT movements = pieces rejected;
  - one entry per product / day / shift while QC hasn't inspected it;
  - the same submission (double-click, retry) is applied once; a failed one changes nothing and may be retried.
Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/concurrency.py
"""
import os, re, json, subprocess, sys, threading, uuid, http.client
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
U=urlparse(B); PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
def num(q): v=sql(q); return float(v) if v else 0.0

# ── calling a server action directly ─────────────────────────────────────────
ACT={}   # name -> (action id, page path)
COOKIE=""
def body(fields):
    b="----bfmsBoundary"+uuid.uuid4().hex[:12]; parts=[]
    for k,v in list(fields.items())+[("0",None)]:
        name="0" if k=="0" else f"_1_{k}"; val='[null,"$K1"]' if k=="0" else str(v)
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{val}\r\n')
    return b, ("".join(parts)+f"--{b}--\r\n").encode()
def call(action, fields):
    aid, path = ACT[action]; b, data = body(fields)
    c=http.client.HTTPConnection(U.hostname, U.port, timeout=120)
    c.request("POST", path, body=data, headers={"content-type":f"multipart/form-data; boundary={b}", "accept":"text/x-component", "next-action":aid,
              "origin":B, "cookie":COOKIE, "next-router-state-tree":"%5B%22%22%2C%7B%7D%2Cnull%2Cnull%2Ctrue%5D"})
    r=c.getresponse(); txt=r.read().decode("utf-8","replace"); c.close()
    m=re.search(r'^1:(\{.*\})\s*$', txt, re.M)
    try: return json.loads(m.group(1)) if m else {"ok":False,"error":f"HTTP {r.status}: {txt[:200]}"}
    except Exception: return {"ok":False,"error":txt[:200]}
def together(jobs):
    """Runs every (action, fields) at the same instant; returns the results in order."""
    out=[None]*len(jobs); gate=threading.Barrier(len(jobs))
    def run(i,a,f): gate.wait(); out[i]=call(a,f)
    ts=[threading.Thread(target=run,args=(i,a,f)) for i,(a,f) in enumerate(jobs)]
    [t.start() for t in ts]; [t.join() for t in ts]; return out

# ── invariants ──────────────────────────────────────────────────────────────
def entries(pid): return sql(f"SELECT id||'|'||quantity||'|'||{Q('\"qcStatus\"')}||'|'||shift FROM {Q('\"ProductionEntry\"')} WHERE {Q('\"productId\"')}='{pid}' ORDER BY {Q('\"createdAt\"')}").split("\n")
def invariants(tag):
    bad=[]
    made=num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')}")
    prod=num(f"SELECT COALESCE(SUM(qty),0) FROM {Q('\"StockMovement\"')} WHERE type='PRODUCTION'")
    if abs(made-prod)>1e-9: bad.append(f"entries {made:g} pcs but PRODUCTION movements {prod:g}")
    label=-num(f"SELECT COALESCE(SUM(qty),0) FROM {Q('\"StockMovement\"')} WHERE type='USE' AND {Q('\"productId\"')}='tslabel00001'")
    made_p1=num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')} WHERE {Q('\"productId\"')}='tpbowl000001'")
    if abs(label-made_p1)>1e-9: bad.append(f"labels used {label:g} ≠ pieces {made_p1:g}")
    kg=-num(f"SELECT COALESCE(SUM(qty),0) FROM {Q('\"StockMovement\"')} WHERE type='USE' AND {Q('\"productId\"')}='tmmaterial01'")
    if abs(kg-made_p1*0.05)>0.0005: bad.append(f"material used {kg:g} kg ≠ {made_p1*0.05:g} kg")
    for r in sql(f"SELECT e.id||'|'||e.quantity||'|'||COALESCE((SELECT SUM({Q('\"qtyRejected\"')}) FROM {Q('\"QcInspection\"')} i WHERE i.{Q('\"entryId\"')}=e.id),0)||'|'||COALESCE((SELECT -SUM(qty) FROM {Q('\"StockMovement\"')} m WHERE m.{Q('\"entryId\"')}=e.id AND m.type='QC_REJECT'),0) FROM {Q('\"ProductionEntry\"')} e").split("\n"):
        if not r: continue
        i,q,rej,mv=r.split("|")
        if float(rej)>float(q): bad.append(f"entry {i[-6:]}: rejected {rej} > produced {q}")
        if abs(float(rej)-float(mv))>1e-9: bad.append(f"entry {i[-6:]}: rejected {rej} but QC_REJECT {mv}")
    dup=sql(f"SELECT count(*) FROM (SELECT day,shift,{Q('\"productId\"')} FROM {Q('\"ProductionEntry\"')} WHERE {Q('\"qcStatus\"')}='NOT_INSPECTED' GROUP BY 1,2,3 HAVING count(*)>1) x")
    if dup!="0": bad.append(f"{dup} product/day/shift with two uninspected entries")
    ck(f"{tag}: stock, use and QC totals all consistent {bad}", not bad)

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    A=br.new_page(); A.on("pageerror", lambda e: errs.append(str(e)))
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    COOKIE="; ".join(f"{c['name']}={c['value']}" for c in A.context.cookies())
    # product P (1 label + 50 g material per piece); label S; material M (kg)
    for i,c,n,k,u in [("tpbowl000001","P-1","Bowl 1800","PRODUCT","pcs"),("tslabel00001","S-1","Bowl label","STICKER","pcs"),("tmmaterial01","M-1","PP granules","MATERIAL","kg")]:
        sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('{i}','{c}','{n}','{k}','{u}',now())")
    sql(f"UPDATE {Q('\"Product\"')} SET {Q('\"labelId\"')}='tslabel00001' WHERE id='tpbowl000001'")
    sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('tpcap0000002','P-2','Cap 28','PRODUCT','pcs',now()),('tpjar0000003','P-3','Jar 1L','PRODUCT','pcs',now())")
    sql(f"INSERT INTO {Q('\"ProductComponent\"')} (id,{Q('\"productId\"')},{Q('\"componentId\"')},qty,per) VALUES ('rc1','tpbowl000001','tmmaterial01',50,'PIECE')")
    day=sql("SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text"); cat=sql(f"SELECT id FROM {Q('\"DefectCategory\"')} WHERE active LIMIT 1")

    # learn the action ids from the real pages (request captured and aborted)
    def learn(name, page, fill, submit):
        cap={}
        def grab(route, req):
            if req.method=="POST" and req.headers.get("next-action"): cap.update(id=req.headers["next-action"], path=urlparse(req.url).path+("?"+urlparse(req.url).query if urlparse(req.url).query else "")); route.abort()
            else: route.continue_()
        A.goto(B+page); A.wait_for_load_state("networkidle"); A.route("**/*", grab); fill(); submit(); A.wait_for_timeout(1200); A.unroute("**/*")
        ACT[name]=(cap["id"], cap["path"])
    def daily_fill():
        if A.locator("text=Only products in open orders").count(): A.uncheck("text=Only products in open orders")
        A.fill("input[name='qty_tpbowl000001']","1")
    learn("daily", f"/production/daily?day={day}&shift=C", daily_fill, lambda: A.get_by_role("button", name=re.compile("Save")).last.click())
    r=call("daily", {"day":day,"shift":"A","qty_tpbowl000001":1000}); print("   first save:", r, ACT, flush=True)
    eid=entries("tpbowl000001")[0].split("|")[0]
    learn("correct", f"/production?day={day}", lambda: (A.get_by_role("button", name="Correct").first.click(), A.fill("input[name=quantity]","999"), A.fill("input[name=reason]","probe")), lambda: A.locator("form", has=A.locator("input[name=reason]")).get_by_role("button", name="Save").click())
    learn("inspect", f"/qc/entries/{eid}", lambda: A.fill("input[name=qtyInspected]","1"), lambda: A.locator("form button[type=submit]").last.click())
    ck(f"server actions reachable directly ({r.get('ok')})", r.get("ok") is True)
    invariants("start")

    # ── M2-a: double-click / retry — the SAME submission three times at once is applied once
    key=str(uuid.uuid4())
    rs=together([("daily", {"day":day,"shift":"B","qty_tpbowl000001":700,"submissionId":key})]*3)
    b=[e for e in entries("tpbowl000001") if e.endswith("|B")]
    ck(f"same submission sent 3× at once → added once (entries {b}, results {[x.get('ok') for x in rs]})", len(b)==1 and b[0].split("|")[1]=="700")
    r=call("daily", {"day":day,"shift":"B","qty_tpbowl000001":700,"submissionId":key})
    ck("…and a later retry of it is not added again", [e for e in entries("tpbowl000001") if e.endswith("|B")][0].split("|")[1]=="700" and r.get("ok") is True)
    invariants("after duplicate submissions")

    # ── M2-b: two people save the same product, day and shift at the same moment → one entry with both amounts
    for rnd in range(3):
        together([("daily", {"day":day,"shift":"C","qty_tpbowl000001":250,"submissionId":str(uuid.uuid4())}) for _ in range(4)])
    c=[e for e in entries("tpbowl000001") if e.endswith("|C")]
    ck(f"4 people × 3 rounds on the same shift → one entry of 3,000 (got {c})", len(c)==1 and c[0].split("|")[1]=="3000")
    invariants("after simultaneous saves")

    # ── M2-b2: several sheets with several products each, in different orders, at once → no deadlock, all saved
    jobs=[]
    for i in range(6):
        f={"day":day,"shift":"B","submissionId":str(uuid.uuid4())}
        order=[("qty_tpcap0000002",10),("qty_tpjar0000003",20)] if i%2 else [("qty_tpjar0000003",20),("qty_tpcap0000002",10)]
        f.update(dict(order)); jobs.append(("daily", f))
    rs=together(jobs)
    caps=sql(f"SELECT string_agg(quantity::text, ',') FROM {Q('\"ProductionEntry\"')} WHERE {Q('\"productId\"')}='tpcap0000002' AND shift='B'")
    jars=sql(f"SELECT string_agg(quantity::text, ',') FROM {Q('\"ProductionEntry\"')} WHERE {Q('\"productId\"')}='tpjar0000003' AND shift='B'")
    ck(f"6 multi-product sheets at once: all saved, no deadlock (caps {caps}, jars {jars}, {[x.get('ok') for x in rs]})", all(x.get("ok") for x in rs) and caps=="60" and jars=="120")

    # ── M2-c: two corrections of the same entry at the same moment → applied once, stock matches
    cid=c[0].split("|")[0]
    rs=together([("correct", {"entryId":cid,"quantity":2800,"reason":f"typing mistake {i}"}) for i in range(3)])
    q=sql(f"SELECT quantity FROM {Q('\"ProductionEntry\"')} WHERE id='{cid}'")
    ck(f"3 identical corrections at once → entry 2,800, one applied ({[x.get('ok') for x in rs]})", q=="2800" and sum(1 for x in rs if x.get("ok"))==1)
    invariants("after simultaneous corrections")

    # ── M2-d: a correction and new production for the same entry at the same moment
    for rnd in range(3):
        cur=int(sql(f"SELECT quantity FROM {Q('\"ProductionEntry\"')} WHERE id='{cid}'"))
        together([("correct", {"entryId":cid,"quantity":cur-100,"reason":"recount"}), ("daily", {"day":day,"shift":"C","qty_tpbowl000001":500,"submissionId":str(uuid.uuid4())})])
    invariants("after correction + new production together")

    # ── M2-e: two inspectors reject pieces of the same entry at the same moment → never more than produced
    aid=[e for e in entries("tpbowl000001") if e.endswith("|A")][0].split("|")[0]   # 1,000 pcs
    rej=lambda n: {"entryId":aid,"qtyInspected":n,"qtyRejected":n,"categoryId":cat,"severity":"MAJOR","issueDescription":"short shots","responsibleDept":"PRODUCTION","submissionId":str(uuid.uuid4())}
    rs=together([("inspect", rej(600)), ("inspect", rej(600))])
    tot=sql(f"SELECT COALESCE(SUM({Q('\"qtyRejected\"')}),0) FROM {Q('\"QcInspection\"')} WHERE {Q('\"entryId\"')}='{aid}'")
    ck(f"two inspectors reject 600 + 600 of 1,000 at once → only one accepted (rejected {tot}, {[x.get('ok') for x in rs]})", tot=="600" and sum(1 for x in rs if x.get("ok"))==1)
    ck("…the other one is told why", any("already rejected" in (x.get("error") or "") for x in rs))
    invariants("after simultaneous inspections")

    # ── M2-f: same inspection sent twice (double-click) → one inspection
    k2=str(uuid.uuid4()); f=rej(100); f["submissionId"]=k2
    rs=together([("inspect", f), ("inspect", f)])
    tot=sql(f"SELECT COALESCE(SUM({Q('\"qtyRejected\"')}),0) FROM {Q('\"QcInspection\"')} WHERE {Q('\"entryId\"')}='{aid}'")
    ck(f"same inspection submitted twice at once → recorded once (rejected {tot})", tot=="700")

    # ── M2-g: a failure part-way through rolls everything back, and the same submission can then be retried
    k3=str(uuid.uuid4())
    before=sql(f"SELECT (SELECT count(*) FROM {Q('\"QcInspection\"')})||'/'||(SELECT count(*) FROM {Q('\"StockMovement\"')})||'/'||(SELECT count(*) FROM {Q('\"QualityIssue\"')})")
    broken={"entryId":aid,"qtyInspected":50,"qtyRejected":50,"categoryId":cat,"issueDescription":"warped","responsibleDept":"PRODUCTION","submissionId":k3}  # no severity → fails after the inspection was written
    r=call("inspect", broken)
    after=sql(f"SELECT (SELECT count(*) FROM {Q('\"QcInspection\"')})||'/'||(SELECT count(*) FROM {Q('\"StockMovement\"')})||'/'||(SELECT count(*) FROM {Q('\"QualityIssue\"')})")
    ck(f"failed inspection leaves nothing behind (before {before}, after {after})", r.get("ok") is False and before==after)
    broken["severity"]="MINOR"; r=call("inspect", broken)
    tot=sql(f"SELECT COALESCE(SUM({Q('\"qtyRejected\"')}),0) FROM {Q('\"QcInspection\"')} WHERE {Q('\"entryId\"')}='{aid}'")
    ck(f"…the corrected retry with the same submission is accepted once (rejected {tot})", r.get("ok") is True and tot=="750")
    invariants("after rollback and retry")

    # ── M2-h: the real daily sheet in the browser — a fast double press, then a retry after a lost reply
    A.goto(B+f"/production/daily?day={day}&shift=A"); A.wait_for_load_state("networkidle")
    if A.locator("text=Only products in open orders").count() and A.is_checked("text=Only products in open orders"): A.uncheck("text=Only products in open orders")
    before=num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')}")
    A.fill("input[name='qty_tpbowl000001']","40")
    A.evaluate("() => { const f = document.querySelector('input[name=day]').form; f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); }")
    A.wait_for_timeout(2500)
    ck("browser: pressing Save three times quickly saves once (+40)", num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')}")==before+40)
    lost={"n":0}
    def drop_reply(route, req):
        if req.method=="POST" and req.headers.get("next-action") and lost["n"]==0:
            lost["n"]=1; route.fetch(); route.abort()   # the server saves it, but the reply never reaches the phone
        else: route.continue_()
    A.route("**/production/daily**", drop_reply)
    A.fill("input[name='qty_tpbowl000001']","60"); A.get_by_role("button", name=re.compile("Save")).last.click(); A.wait_for_timeout(2500)
    mid=num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')}")
    ck("browser: after a lost reply the sheet stays, with the typed amount and a 'press Save again' message", "connection was interrupted" in A.inner_text("main") and A.input_value("input[name='qty_tpbowl000001']")=="60")
    A.get_by_role("button", name=re.compile("Save")).last.click(); A.wait_for_timeout(2500)   # the employee presses Save again
    A.unroute("**/production/daily**")
    after=num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')}")
    ck(f"browser: retry after a lost reply is not added twice (+60 once: {before+40:g} → {mid:g} → {after:g})", mid==before+100 and after==before+100)
    A.fill("input[name='qty_tpbowl000001']","60"); A.get_by_role("button", name=re.compile("Save")).last.click(); A.wait_for_timeout(2500)
    ck("browser: a NEW save of the same amount afterwards is added (+60)", num(f"SELECT COALESCE(SUM(quantity),0) FROM {Q('\"ProductionEntry\"')}")==before+160)
    invariants("after browser double press and retry")

    # ── M1: kg quantities with 3 decimals are accepted and kept exactly
    stock_doc(A, B, "INPUT", [("M-1","1.001",None)], reason="COUNT")
    ok1="/stock/" in A.url and "saved=1" in A.url
    stock_doc(A, B, "OUTPUT", [("M-1","0.999",None)], reason="SAMPLE")
    ok2="/stock/" in A.url and "saved=1" in A.url
    docs=sql(f"SELECT string_agg(qty::text, ',' ORDER BY {Q('\"createdAt\"')}) FROM {Q('\"StockMovement\"')} WHERE {Q('\"productId\"')}='tmmaterial01' AND type IN ('INPUT','OUTPUT')")
    ck(f"1.001 kg in and 0.999 kg out are accepted and stored exactly ({ok1}, {ok2}, {docs})", ok1 and ok2 and docs=="1.001,-0.999")
    n=sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")
    stock_doc(A, B, "INPUT", [("M-1","1.0015",None)], reason="COUNT")
    ck("4 decimals of a kg is refused with a clear message", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==n and "at most 3 decimals" in A.inner_text("main"))
    for v in ["0.001","2.003","10.009","123.457"]:
        stock_doc(A, B, "INPUT", [("M-1",v,None)], reason="COUNT")
    ck("other 3-decimal amounts accepted (0.001, 2.003, 10.009, 123.457)", sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==str(int(n)+4))
    kg=sql(f"SELECT SUM(qty)::text FROM {Q('\"StockMovement\"')} WHERE {Q('\"productId\"')}='tmmaterial01' AND type IN ('INPUT','OUTPUT')")
    ck(f"ledger sum exact: 1.001 − 0.999 + 0.001 + 2.003 + 10.009 + 123.457 = 135.472 ({kg})", kg=="135.472")
    A.goto(B+"/inventory?tab=materials"); ck("warehouse shows kg with 3 decimals", re.search(r"\d+\.\d{3}", A.locator("li", has_text="M-1").first.inner_text()) is not None)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
