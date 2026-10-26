"""Customer accounts, discounts, delivery place, automatic invoice numbers and balances on receipts (accountant, 26 Oct 2026).
Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/customers.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def doc_id(pg): return pg.url.split("/")[-1].split("?")[0]

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
    # the owner lets Sales sell and keep customer accounts (as done in Administration → Roles)
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id,p FROM {Q('\"Role\"')} CROSS JOIN (VALUES ('stock:sell'),('customers:view'),('customers:manage')) v(p) WHERE name='Sales Manager'")
    for i,c,n in [("tpbowl000001","P-100","Bereket bowl 1800"),("tpcap0000002","P-200","Cap 28")]:
        sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,kind,unit,{Q('\"updatedAt\"')}) VALUES ('{i}','{c}','{n}','PRODUCT','pcs',now())")
    stock_doc(A, B, "INPUT", [("P-100",5000,None),("P-200",20000,None)], reason="COUNT")
    yr=sql("SELECT extract(year from now())::int")

    # ── 7. customers get codes automatically (or a typed one)
    S=ctx(); login(S,"sara",pw["sara"])
    def new_customer(name, phone="", address="", code=""):
        S.goto(B+"/customers"); S.get_by_role("button", name="New customer").click()
        S.get_by_label("Customer name").fill(name); S.get_by_label("Phone").fill(phone); S.get_by_label("Address").fill(address)
        if code: S.get_by_label("Customer code").fill(code)
        S.get_by_role("button", name="Add customer").click(); S.wait_for_url(re.compile(r".*/customers/[^/]+\?saved=1$")); return doc_id(S)
    c1=new_customer("Al Noor Market","0750 999 8888","Duhok, Malta")
    c2=new_customer("Kurdistan Shop","0751 000 0000")
    c3=new_customer("Zakho Wholesale", code="vip-1")
    codes=sql(f"SELECT string_agg(code, ',' ORDER BY {Q('\"createdAt\"')}) FROM {Q('\"Customer\"')}")
    ck(f"customer codes: automatic C-0001, C-0002, typed VIP-1 ({codes})", codes=="C-0001,C-0002,VIP-1")
    S.goto(B+"/customers"); S.get_by_role("button", name="New customer").click(); S.get_by_label("Customer name").fill("al noor market"); S.get_by_role("button", name="Add customer").click(); S.wait_for_timeout(1200)
    ck("the same customer can't be added twice (name, any capitals)", "already exists (C-0001)" in S.inner_text("main"))
    S.goto(B+"/search?q=C-0002"); ck("search by customer code opens the customer", f"/customers/{c2}" in S.url)

    # ── 1, 5, 6: a sale to a customer: delivery place, automatic invoice number, line + invoice discounts
    form=stock_doc(S, B, "SELL", [("P-100",1800,"250",(10,"%")),("P-200",5000,"50",(10000,"amount"))], party="Al Noor Market", currency="IQD", delivery="Duhok — Malta market", discount=(5000,"amount"), paid=100000, save=False)
    ck("sell form: phone filled from the customer", S.get_by_label("Phone", exact=True).input_value()=="0750 999 8888")
    ck("sell form: no typed invoice box (number is automatic)", S.get_by_label("Invoice", exact=True).count()==0 and "given automatically" in form)
    ck("sell form: totals with discounts (645,000 − 5,000 = 640,000) and new balance −540,000", "645,000" in form and "640,000" in form and S.get_by_test_id("new-balance").inner_text().endswith("-540,000 IQD"))
    S.get_by_role("button", name=re.compile("^Save sale")).click(); S.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); s1=doc_id(S); out=S.inner_text("main")
    row=sql(f"SELECT {Q('\"invoiceNo\"')}||'|'||subtotal||'|'||discount||'|'||total||'|'||delivery||'|'||c.code FROM {Q('\"StockDoc\"')} d JOIN {Q('\"Customer\"')} c ON c.id=d.{Q('\"customerId\"')} WHERE d.id='{s1}'")
    ck(f"sale saved: INV-{yr}-0001, subtotal 645,000, discount 5,000, total 640,000, delivery, C-0001 ({row})", row==f"INV-{yr}-0001|645000.00|5000.00|640000.00|Duhok — Malta market|C-0001")
    lines=sql(f"SELECT string_agg(coalesce(discount::text,'-')||'/'||coalesce({Q('\"discountKind\"')}::text,'-'), ',' ORDER BY qty) FROM {Q('\"StockMovement\"')} WHERE {Q('\"docId\"')}='{s1}'")
    ck(f"line discounts stored (45,000 = 10%, 10,000 amount) ({lines})", lines=="10000.00/AMOUNT,45000.00/PERCENT")
    ck("sale page shows delivery, discount column, subtotal and the customer's balance −540,000", "Duhok — Malta market" in out and "−45,000 (10%)" in out and "645,000" in out and "-540,000 IQD" in S.get_by_test_id("customer-balance").inner_text())
    form=stock_doc(S, B, "SELL", [("P-100",10,"100",(120,"%"))], party="Kurdistan Shop", currency="IQD", paid=0, save=False)
    S.get_by_role("button", name=re.compile("^Save sale")).click(); S.wait_for_timeout(1500)
    ck("a discount above 100% is refused", "can't be more than 100%" in S.inner_text("main") and "/stock/new" in S.url)
    stock_doc(S, B, "SELL", [("P-100",10,"100")], party="Kurdistan Shop", currency="IQD", paid=0, discount=(5000,"amount"), save=False)
    S.get_by_role("button", name=re.compile("^Save sale")).click(); S.wait_for_timeout(1500)
    ck("an invoice discount larger than the invoice is refused", "more than the amount" in S.inner_text("main"))

    # ── 2, 3: one running balance per customer — second sale, then a payment on the account
    stock_doc(S, B, "SELL", [("P-200",100,"1000")], party="Al Noor Market", currency="IQD", paid=0); s2=doc_id(S)
    ck(f"second sale gets INV-{yr}-0002", sql(f"SELECT {Q('\"invoiceNo\"')} FROM {Q('\"StockDoc\"')} WHERE id='{s2}'")==f"INV-{yr}-0002")
    S.goto(B+f"/customers/{c1}")
    ck("customer page: balance −640,000 IQD, owes the factory", S.get_by_test_id("balance-IQD").inner_text()=="-640,000 IQD" and "owes the factory" in S.inner_text("main"))
    st=S.inner_text("main")
    ck("statement: both sales (−640,000 / −100,000) and the payment (+100,000) with running balance", "-640,000 IQD" in st and "-100,000 IQD" in st and "+100,000 IQD" in st and "-540,000 IQD" in st)
    A.goto(B+"/cash?tab=owed"); ck("safe 'still owed': Al Noor Market owes 640,000", "Al Noor Market" in A.inner_text("main") and "640,000 IQD" in A.inner_text("main"))
    S.goto(B+"/customers?show=owing"); ck("customers list filter 'owe us money' shows only Al Noor", "Al Noor Market" in S.inner_text("main") and "Kurdistan Shop" not in S.inner_text("main"))
    S.goto(B+f"/customers/{c1}"); S.get_by_label("Amount received").fill("700000"); S.get_by_label("Payment note").fill("cash"); S.get_by_role("button", name="Save payment").click(); S.wait_for_timeout(1800)
    ck("payment of 700,000 on the account → balance +60,000 (the factory owes the customer)", S.get_by_test_id("balance-IQD").inner_text()=="60,000 IQD" and "factory owes the customer" in S.inner_text("main"))
    ck("…and the money is in the safe", sql(f"SELECT SUM(amount)::text FROM {Q('\"CashEntry\"')} WHERE currency='IQD'")=="800000.00")

    # ── 4: receipts show the invoice, previous balance, paid now and new balance (customer owes = −)
    S.goto(B+f"/print/receipt/doc/{s2}"); r2=S.inner_text("main")
    ck("receipt of the 2nd sale: previous −540,000, paid now 0, new balance −640,000", "Previous balance" not in r2 and "الرصيد السابق" in r2 and "-540,000 IQD" in r2 and S.get_by_test_id("receipt-new-balance").inner_text()=="-640,000 IQD")
    S.goto(B+f"/print/receipt/doc/{s1}"); r1=S.inner_text("main")
    ck("reprint of the 1st sale keeps its own numbers: previous 0, paid 100,000, new −540,000", S.get_by_test_id("receipt-new-balance").inner_text()=="-540,000 IQD" and "100,000 IQD" in r1)
    ck("receipt shows delivery place, customer code, discount column, subtotal and invoice discount", all(x in r1 for x in ["Duhok — Malta market","C-0001","مكان التسليم","رمز الزبون","الخصم","645,000","−5,000","−45,000 (10%)",f"INV-{yr}-0001"]))
    pid=sql(f"SELECT id FROM {Q('\"CashEntry\"')} WHERE amount=700000")
    S.goto(B+f"/print/receipt/payment/{pid}"); pr=S.inner_text("main")
    ck("payment receipt: received 700,000, balance before −640,000, after 60,000", "700,000 IQD" in pr and "-640,000 IQD" in pr and "60,000 IQD" in pr and "C-0001" in pr)
    A.goto(B+"/receipts/new"); A.get_by_label("Layout name").fill("English sales"); A.get_by_label("Receipt language").select_option("en")
    A.get_by_role("button", name="Save layout").click(); A.wait_for_url(re.compile(r".*/receipts\?saved="))
    lid=sql(f"SELECT id FROM {Q('\"ReceiptLayout\"')} WHERE name='English sales'")
    S.goto(B+f"/print/receipt/doc/{s2}?layout={lid}"); en=S.inner_text("main")
    ck("English receipt: 'Previous balance', 'New balance', sign explained", "Previous balance" in en and "New balance" in en and "the customer owes the factory" in en)

    # ── reports, money rules, old sales
    day=sql("SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text")
    A.goto(B+f"/reports/trade?from={day}&to={day}"); ck("Buying & selling report: sold 740,000 IQD (after discounts)", "740,000" in A.inner_text("main"))
    W=ctx(); login(W,"walid",pw["walid"])
    W.goto(B+"/customers"); ck("warehouse can't open customers", "/forbidden" in W.url)
    W.goto(B+f"/stock/{s1}"); ck("warehouse sees the sale but no balance or discounts in money", "-540,000" not in W.content() and "45,000" not in W.content())
    n=sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")
    stock_doc(S, B, "SELL", [("P-100",1,"1")], currency="IQD", paid=0, save=False)
    S.get_by_role("button", name=re.compile("^Save sale")).click(); S.wait_for_timeout(1500)
    ck("a sale without a customer is refused", "Choose the customer" in S.inner_text("main") and sql(f"SELECT count(*) FROM {Q('\"StockDoc\"')}")==n)

    # ── phone + Arabic
    M=ctx(**p.devices["iPhone 13"]); login(M,"sara",pw["sara"]); over=[]
    for path in ["/customers",f"/customers/{c1}","/stock/new?type=SELL",f"/stock/{s1}"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    S.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); S.goto(B+f"/customers/{c1}"); ck("Arabic customer page", "كشف الحساب" in S.inner_text("main"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
