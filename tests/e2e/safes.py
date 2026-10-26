"""Several safes, transfers between safes, exchange with three boxes (accountant, 26 Oct 2026). EMPTY database.
Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/safes.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc, pick_customer
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def num(s): return float(s) if s not in ("", None) else 0.0
def bal(safe, cur):
    """Balance of one safe in one currency, straight from the database."""
    return num(sql(f"SELECT coalesce(sum(e.amount),0) FROM {Q('\"CashEntry\"')} e JOIN {Q('\"Safe\"')} s ON s.id=e.{Q('\"safeId\"')} WHERE s.name='{safe}' AND e.currency='{cur}'"))
def total(cur): return num(sql(f"SELECT coalesce(sum(amount),0) FROM {Q('\"CashEntry\"')} WHERE currency='{cur}'"))
def opt_text(pg, label): return [o.strip() for o in pg.get_by_label(label, exact=True).locator("option").all_inner_texts()]
def saved(pg):
    try: pg.wait_for_url(re.compile(r".*/cash/[^/]+\?saved=1$"), timeout=10000)
    except Exception: pass
    pg.wait_for_load_state("networkidle"); return pg.inner_text("main")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        pg=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    pw={}
    for eid,name,user,role,dept in [("1001","Sara Sales","sara","Sales Manager","Sales & Planning"),("1005","Walid Warehouse","walid","Warehouse Team","Warehouse")]:
        A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId",eid); A.fill("#fullName",name); A.fill("#username",user)
        A.select_option("#roleId", label=role); A.select_option("#departmentId", label=dept); A.click("form button[type=submit]")
        A.wait_for_selector("text=Temporary password"); temp=A.locator("code").nth(1).inner_text()
        pg=ctx(); login(pg,user,temp); pw[user]=f"{user.capitalize()}Factory2026"
        pg.fill("#current",temp); pg.fill("#next",pw[user]); pg.fill("#confirm",pw[user]); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); pg.context.close()
    # Sales may sell (no Safe view: sees the safes' names but not what is in them)
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id,p FROM {Q('\"Role\"')} CROSS JOIN (VALUES ('stock:sell'),('customers:view'),('customers:manage')) v(p) WHERE name='Sales Manager'")
    sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('tpbowl000001','P-100','Bereket bowl 1800','PRODUCT','pcs',now())")
    stock_doc(A, B, "INPUT", [("P-100",5000,None)], reason="COUNT")
    yr=sql("SELECT extract(year from now())::int")

    # ── 1. the main safe is there; the owner adds more safes with their own name and currencies
    A.goto(B+"/cash"); ck("main safe exists with IQD, USD and EUR", A.get_by_test_id("safe-Main safe").inner_text().split("\n")==["0 IQD","0 USD","0 EUR"])
    def new_safe(name, curs):
        A.goto(B+"/cash?tab=safes"); A.get_by_role("button", name="New safe").click()
        A.get_by_label("Safe name").fill(name)
        for c in ["IQD","USD","EUR"]:
            box=A.get_by_label(re.compile(f"^{c} — ")); (box.check() if c in curs else box.uncheck())
        A.get_by_role("button", name="Save safe").click(); A.wait_for_timeout(1200); A.wait_for_load_state("networkidle")
    new_safe("Dollar box", ["USD"]); new_safe("Office safe", ["IQD","USD"])
    ck("two new safes saved with their currencies", sql(f"SELECT string_agg(name||':'||array_to_string(currencies,'+'),',' ORDER BY {Q('\"createdAt\"')}) FROM {Q('\"Safe\"')}")=="Main safe:IQD+USD+EUR,Dollar box:USD,Office safe:IQD+USD")
    new_safe("dollar BOX", ["USD"]); ck("same name twice is refused", "already exists" in A.inner_text("main") and sql(f"SELECT count(*) FROM {Q('\"Safe\"')}")=="3")
    A.goto(B+"/cash?tab=safes"); A.get_by_role("button", name="New safe").click(); A.get_by_label("Safe name").fill("Empty one"); A.get_by_label(re.compile("^IQD — ")).uncheck()
    ck("a safe needs at least one currency (save is off)", A.get_by_role("button", name="Save safe").is_disabled())
    A.goto(B+"/cash"); ck("each safe has its own card", all(A.get_by_test_id(f"safe-{n}").count()==1 for n in ["Main safe","Dollar box","Office safe"]))

    # ── 2. money in / out: choose the safe; only its currencies are offered
    def cash(typ, safe, cur, amount, note="By hand", category=None):
        A.goto(B+f"/cash/new?type={typ}"); A.wait_for_load_state("networkidle")
        sel=A.get_by_label("Safe", exact=True); sel.select_option(value=[o for o in sel.locator("option").evaluate_all("os=>os.map(o=>[o.value,o.textContent])") if o[1].startswith(safe)][0][0])
        A.get_by_label("Currency", exact=True).select_option(cur); A.get_by_label("Amount", exact=True).fill(str(amount))
        if category: A.get_by_label("Spent on").select_option(label=category)
        A.get_by_label("Note").fill(note)
        A.get_by_role("button", name=re.compile("^Save (money in|expense)")).click(); return saved(A)
    cash("IN","Main safe","IQD",10_000_000); cash("IN","Main safe","USD",5000); cash("IN","Dollar box","USD",2000)
    ck("money in goes to the chosen safe", bal("Main safe","IQD")==10_000_000 and bal("Main safe","USD")==5000 and bal("Dollar box","USD")==2000)
    A.goto(B+"/cash/new?type=IN"); sel=A.get_by_label("Safe", exact=True)
    did=[o[0] for o in sel.locator("option").evaluate_all("os=>os.map(o=>[o.value,o.textContent])") if o[1].startswith("Dollar box")][0]
    sel.select_option(did); ck("Dollar box offers only USD", opt_text(A,"Currency")==["USD — US dollar"])
    out=cash("OUT","Dollar box","USD",300,category="Transport"); ck("expense from the Dollar box only lowers that safe", bal("Dollar box","USD")==1700 and bal("Main safe","USD")==5000 and "Dollar box" in out)
    A.goto(B+f"/cash/new?type=OUT&safe={did}"); A.get_by_label("Amount", exact=True).fill("1800")
    ck("can't take more than that safe has (other safes don't count)", A.get_by_role("button", name="Save expense").is_disabled() and "More than the safe has" in A.inner_text("main"))

    # ── 3. exchange: three boxes — any two give the third
    def sid(name): return sql(f"SELECT id FROM {Q('\"Safe\"')} WHERE name='{name}'")
    main, dollar, office = sid("Main safe"), sid("Dollar box"), sid("Office safe")
    def ex_open(src, cur, dst, to):
        A.goto(B+f"/cash/new?type=EXCHANGE&safe={src}"); A.wait_for_load_state("networkidle")
        A.get_by_label("Currency you give").select_option(cur); A.get_by_label("To safe").select_option(dst); A.get_by_label("Currency you receive").select_option(to)
    box=lambda k: A.get_by_test_id(f"ex-{k}")
    # (a) amount given + rate → amount received
    ex_open(main,"USD",office,"IQD"); box("from").fill("1000"); box("rate").fill("1450")
    ck("rate label is 1 USD = ? IQD", A.get_by_label("Rate: 1 USD = ? IQD").count()==1)
    ck("(a) 1,000 USD at 1,450 → receive box shows 1,450,000", box("to").input_value()=="1450000")
    A.get_by_role("button", name="Save exchange").click(); out=saved(A)
    ck("(a) saved: Main safe −1,000 USD, Office safe +1,450,000 IQD", f"EXC-{yr}-0001" in out and bal("Main safe","USD")==4000 and bal("Office safe","IQD")==1_450_000 and "1 USD = 1,450 IQD" in out and "Office safe" in out)
    # (b) both amounts → rate
    ex_open(main,"IQD",dollar,"USD"); box("from").fill("1460000"); box("to").fill("1000")
    ck("(b) 1,460,000 IQD → 1,000 USD: rate box shows 1460", box("rate").input_value()=="1460")
    A.get_by_role("button", name="Save exchange").click(); out=saved(A)
    ck("(b) saved: Main −1,460,000 IQD, Dollar box +1,000 USD, rate 1 USD = 1,460 IQD", bal("Main safe","IQD")==8_540_000 and bal("Dollar box","USD")==2700 and "1 USD = 1,460 IQD" in out)
    # (c) amount received + rate → amount given
    ex_open(main,"IQD",main,"USD"); box("to").fill("500"); box("rate").fill("1470")
    ck("(c) receive 500 USD at 1,470 → give box shows 735,000", box("from").input_value()=="735000")
    box("rate").fill("1480"); ck("…changing the rate recalculates the calculated box (740,000)", box("from").input_value()=="740000")
    A.get_by_role("button", name="Save exchange").click(); out=saved(A)
    ck("(c) saved inside the main safe: −740,000 IQD, +500 USD", bal("Main safe","IQD")==7_800_000 and bal("Main safe","USD")==4500 and f"EXC-{yr}-0003" in out)
    ex_open(dollar,"USD",office,"IQD"); box("from").fill("2701"); box("rate").fill("1450")
    ck("can't exchange more than that safe has", A.get_by_role("button", name="Save exchange").is_disabled())
    ex_open(dollar,"USD",office,"IQD"); ck("receive currency never equals the given one", "USD — US dollar" not in opt_text(A,"Currency you receive"))

    # ── 4. transfer between safes (same currency)
    def transfer(src, dst, cur, amount, save=True):
        A.goto(B+f"/cash/new?type=TRANSFER&safe={src}"); A.wait_for_load_state("networkidle")
        A.get_by_label("Currency", exact=True).select_option(cur); A.get_by_label("To safe").select_option(dst); A.get_by_label("Amount", exact=True).fill(str(amount))
        if not save: return
        A.get_by_role("button", name="Save transfer").click(); return saved(A)
    before={c: total(c) for c in ["IQD","USD","EUR"]}
    out=transfer(dollar, main, "USD", 700)
    ck("transfer TRF: Dollar box −700 USD, Main +700 USD", f"TRF-{yr}-0001" in out and bal("Dollar box","USD")==2000 and bal("Main safe","USD")==5200 and "Dollar box" in out and "Main safe" in out)
    ck("…the total of all safes doesn't change", {c: total(c) for c in ["IQD","USD","EUR"]}==before)
    transfer(dollar, main, "USD", 2001, save=False); ck("can't transfer more than the safe has", A.get_by_role("button", name="Save transfer").is_disabled())
    A.goto(B+f"/cash/new?type=TRANSFER&safe={dollar}"); ck("transfer only offers safes holding that currency, not the same safe", sorted(opt_text(A,"To safe"))==sorted(["Main safe — 5,200 USD","Office safe — 0 USD"]))

    # ── 5. sales and purchases: choose the safe for the money paid now / later
    out=stock_doc(A, B, "SELL", [("P-100",100,"5000")], party="Al Noor Market", currency="IQD", paid=300000, save=False)
    A.get_by_label("Into safe").select_option(office)
    A.get_by_role("button", name=re.compile("^Save sale")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); sale=A.url.split("/")[-1].split("?")[0]
    ck("sale: received now goes into the chosen Office safe", bal("Office safe","IQD")==1_750_000)
    A.get_by_label("Into safe").select_option(main); A.get_by_label("Amount", exact=True).fill("200000"); A.get_by_role("button", name="Receive payment").click(); A.wait_for_timeout(1500)
    ck("later payment goes into the chosen Main safe", bal("Main safe","IQD")==8_000_000)
    stock_doc(A, B, "BUY", [("P-100",10,"10")], party="Euro Polymers", currency="USD", paid=100, save=False)
    A.get_by_label("Paid from safe").select_option(dollar)
    A.get_by_role("button", name=re.compile("^Save purchase")).click(); A.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$"))
    ck("purchase paid from the Dollar box", bal("Dollar box","USD")==1900)
    cid=sql(f"SELECT id FROM {Q('\"Customer\"')} WHERE name='Al Noor Market'")
    A.goto(B+f"/customers/{cid}"); A.get_by_label("Amount received").fill("50000"); A.get_by_label("Into safe").select_option(office); A.get_by_role("button", name="Save payment").click(); A.wait_for_timeout(1500)
    ck("customer payment into the chosen Office safe", bal("Office safe","IQD")==1_800_000)

    # ── 6. Sales (no Safe view) chooses a safe by name but never sees what is in it
    S=ctx(); login(S,"sara",pw["sara"])
    stock_doc(S, B, "SELL", [("P-100",10,"5000")], party="Al Noor Market", currency="USD", paid=20, save=False)
    o=opt_text(S,"Into safe"); ck(f"sales sees safe names without balances ({o})", sorted(o)==sorted(["Main safe","Dollar box","Office safe"]))
    S.get_by_label("Currency").select_option("EUR"); ck("…only safes holding the currency (EUR → Main safe)", opt_text(S,"Into safe")==["Main safe"])
    S.goto(B+"/cash"); ck("sales can't open the safes", "/forbidden" in S.url)

    # ── 7. edit / delete safes
    A.goto(B+"/cash?tab=safes"); A.get_by_role("button", name="Edit: Dollar box").click(); A.get_by_label("Safe name").fill("Dollar cash box"); A.get_by_label(re.compile("^EUR — ")).check()
    A.get_by_role("button", name="Save safe").click(); A.wait_for_timeout(1200)
    ck("rename + add EUR", sql(f"SELECT array_to_string(currencies,'+') FROM {Q('\"Safe\"')} WHERE name='Dollar cash box'")=="USD+EUR")
    A.goto(B+"/cash?tab=safes"); A.get_by_role("button", name="Edit: Dollar cash box").click(); A.get_by_label(re.compile("^USD — ")).uncheck(); A.get_by_role("button", name="Save safe").click(); A.wait_for_timeout(1200)
    ck("can't remove USD while the safe still has USD", "still has 1,900 USD" in A.inner_text("main") and "USD" in sql(f"SELECT array_to_string(currencies,'+') FROM {Q('\"Safe\"')} WHERE name='Dollar cash box'"))
    new_safe("Typo safe", ["EUR"]); A.goto(B+"/cash?tab=safes")
    ck("main safe and used safes can't be deleted; an unused one can", A.get_by_role("button", name="Delete: Main safe").count()==0 and A.get_by_role("button", name="Delete: Office safe").count()==0 and A.get_by_role("button", name="Delete: Typo safe").count()==1)
    A.get_by_role("button", name="Delete: Typo safe").click(); A.wait_for_timeout(1200); ck("unused safe deleted", sql(f"SELECT count(*) FROM {Q('\"Safe\"')} WHERE name='Typo safe'")=="0")

    # ── 8. lists, filters, report, audit
    A.goto(B+f"/cash?safe={office}"); out=A.inner_text("main")
    ck("filter by safe: only the Office safe's movements", f"EXC-{yr}-0001" in out and f"EXC-{yr}-0002" not in out and f"TRF-{yr}-0001" not in out)
    day=sql("SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text")
    A.goto(B+f"/reports/cash?from={day}&to={day}"); A.wait_for_load_state("networkidle"); out=A.inner_text("main")
    ck("money report has a Safe column with the safe names", "Safe" in out and "Dollar cash box" in out and "Office safe" in out and "Transfer" in out)
    acts=set(sql(f"SELECT string_agg(DISTINCT action, ',') FROM {Q('\"AuditLog\"')} WHERE action LIKE 'cash.%'").split(","))
    ck("audit log: safe added/changed/deleted, transfer, exchange", {"cash.safeCreate","cash.safeUpdate","cash.safeDelete","cash.transfer","cash.exchange"}<=acts)
    ck("no safe below zero in any currency", sql(f"SELECT count(*) FROM (SELECT 1 FROM {Q('\"CashEntry\"')} GROUP BY {Q('\"safeId\"')},currency HAVING sum(amount)<0) x")=="0")
    W=ctx(); login(W,"walid",pw["walid"]); W.goto(B+"/cash?tab=safes"); ck("warehouse can't open the safes", "/forbidden" in W.url)

    # ── 9. phone + Arabic
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/cash","/cash?tab=safes","/cash/new?type=EXCHANGE","/cash/new?type=TRANSFER"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+"/cash/new?type=EXCHANGE"); ck("Arabic exchange form", "المبلغ المستلم" in A.inner_text("main"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
