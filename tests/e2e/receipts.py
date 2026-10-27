"""Receipts — saved print layouts (banner, fields, columns, language) and printing Sell / Buy / payment receipts. EMPTY database.
   Start the app on :3001 against bereket_accept (see TESTING.md), then: python3 tests/e2e/receipts.py"""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from stockdoc import stock_doc, pick_customer
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
O="/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/receipts/"; os.makedirs(O, exist_ok=True)
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
PW="OwnerPass2026!"
# a small red banner picture (PNG) to upload
BANNER=O+"banner.png"
def png(w,h,rgb):
    import zlib, struct
    raw=b"".join(b"\x00"+bytes(rgb)*w for _ in range(h))
    ch=lambda t,d: struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
    return b"\x89PNG\r\n\x1a\n"+ch(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+ch(b"IDAT",zlib.compress(raw))+ch(b"IEND",b"")
open(BANNER,"wb").write(png(800,160,(200,30,40)))
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        pg=br.new_context(**({"viewport":{"width":1440,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId","1001"); A.fill("#fullName","Sara Sales"); A.fill("#username","sara")
    A.select_option("#roleId", label="Sales Manager"); A.select_option("#departmentId", label="Sales & Planning"); A.click("form button[type=submit]")
    A.wait_for_selector("text=Temporary password"); temp=A.locator("code").nth(1).inner_text()
    S=ctx(); login(S,"sara",temp); S.fill("#current",temp); S.fill("#next","SaraFactory2026"); S.fill("#confirm","SaraFactory2026"); S.click("button[type=submit]"); S.wait_for_url("**/dashboard", wait_until="commit")
    sql(f"INSERT INTO {Q('\"RolePermission\"')} ({Q('\"roleId\"')},permission) SELECT id, p FROM {Q('\"Role\"')} CROSS JOIN (VALUES ('stock:sell')) v(p) WHERE name='Sales Manager'")
    for code,name,n2 in [("P-100","كاسة بركة 1800","BEREKET KASE 1800"),("P-200","غطاء 28","KAPAK 28")]:
        sql(f"INSERT INTO {Q('\"Product\"')} (id,code,name,name2,kind,unit,{Q('\"updatedAt\"')}) VALUES ('t{code}','{code}','{name}','{n2}','PRODUCT','pcs',now())")
    yr=sql("SELECT extract(year from now())::int")

    # 1. a sale with phone; part paid
    out=stock_doc(S, B, "SELL", [("P-100",1800,"250"),("P-200",5000,"50")], party="Al Noor Market", phone="0750 123 4567", currency="IQD", paid="500000", save=False)
    S.get_by_role("button", name=re.compile("^Save sale")).click(); S.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$")); sid=S.url.split("/")[-1].split("?")[0]
    ck("sale saved with the customer's phone", sql(f"SELECT phone FROM {Q('\"StockDoc\"')} WHERE id='{sid}'")=="0750 123 4567" and "0750 123 4567" in S.inner_text("main"))
    S.goto(B+"/stock/new?type=SELL"); pick_customer(S, "Al Noor Market")
    ck("choosing a known customer fills the phone", S.get_by_label("Phone", exact=True).input_value()=="0750 123 4567")

    # 2. no layouts yet: standard layout still prints everything
    A.goto(B+f"/print/receipt/doc/{sid}"); txt=A.inner_text("main")
    ck("standard receipt: title, customer, phone, lines, total, paid, remaining", all(x in txt for x in ["فاتورة بيع","Al Noor Market","0750 123 4567","كاسة بركة 1800","700,000 IQD","500,000 IQD","200,000 IQD"]))
    ck("…total in words", "فقط سبعمائة ألف دينار عراقي لا غير" in txt)
    ck("…signature boxes", "توقيع المستلم" in txt and "توقيع المحاسب" in txt)

    # 3. receipts window: make the accountant's layout
    A.goto(B+"/receipts"); ck("receipts window opens (owner sees New layout)", A.get_by_role("link", name="New layout").count()>=1)
    A.goto(B+"/receipts/new"); A.get_by_label("Layout name").fill("Bereket A4 Arabic")
    A.locator("input[type=file]").set_input_files(BANNER); A.wait_for_timeout(800)
    ck("banner shows in the live preview", A.get_by_test_id("receipt-preview").locator("img").count()==1)
    A.get_by_label("Text under the banner (address, phones…)").fill("دهوك - المنطقة الصناعية · 0750 000 0000")
    A.get_by_label("Accountant's name").check(); A.get_by_label("Time").check()
    A.get_by_label("Code", exact=True).check()
    A.get_by_role("button", name="Code down").click()  # code after line no.
    pv=A.get_by_test_id("receipt-preview").inner_text()
    ck("preview uses the real sale (not sample data)", "Al Noor Market" in pv and "SAL-" in pv)
    hdr=A.get_by_test_id("receipt-preview").locator("thead th").all_inner_texts()
    ck(f"column order follows the arrows ({hdr})", hdr[:3]==["ت","اسم المادة","الرمز"] or hdr[:3]==["ت","الرمز","اسم المادة"])
    A.get_by_role("button", name="Save layout").click(); A.wait_for_url(re.compile(r".*/receipts\?saved=")); A.wait_for_load_state("networkidle")
    ck("layout saved, first one becomes default", "Bereket A4 Arabic" in A.inner_text("main") and sql(f"SELECT {Q('\"isDefault\"')} FROM {Q('\"ReceiptLayout\"')} WHERE name='Bereket A4 Arabic'")=="t")
    ck("banner kept in the database", sql(f"SELECT left(banner,22) FROM {Q('\"ReceiptLayout\"')}")=="data:image/png;base64,")

    # 4. an English layout too
    A.goto(B+"/receipts/new"); A.get_by_label("Layout name").fill("Export English"); A.get_by_label("Receipt language").select_option("en")
    A.get_by_label("Title", exact=True).fill("INVOICE"); A.get_by_role("checkbox", name="Second name", exact=True).first.check(); A.get_by_role("checkbox", name="Item name", exact=True).first.uncheck()
    A.get_by_role("button", name="Save layout").click(); A.wait_for_url(re.compile(r".*/receipts\?saved="))
    ck("second layout not default", sql(f"SELECT {Q('\"isDefault\"')} FROM {Q('\"ReceiptLayout\"')} WHERE name='Export English'")=="f")

    # 5. printing chooses the layout
    A.goto(B+f"/stock/{sid}"); ck("sale page has Print receipt", A.get_by_role("link", name="Print receipt").count()==1)
    A.goto(B+f"/print/receipt/doc/{sid}"); txt=A.inner_text("main")
    ck("default layout used: banner, header text, accountant, code column", A.locator(".receipt-page img").count()==1 and "المنطقة الصناعية" in txt and "Sara Sales" in txt and "P-100" in txt)
    A.get_by_role("link", name="Export English").click(); A.wait_for_url(re.compile(r".*layout=")); A.wait_for_load_state("networkidle"); txt=A.inner_text("main")
    ck("switching to the English layout: title, second names, English words", "INVOICE" in txt and "BEREKET KASE 1800" in txt and "كاسة بركة 1800" not in txt and "Seven hundred thousand Iraqi dinars only" in txt)
    ck("…English layout reads left-to-right", A.locator(".receipt-page").get_attribute("dir")=="ltr")
    A.emulate_media(media="print"); ck("toolbar hidden when printing", not A.get_by_role("button", name=re.compile(r"Print \/ Save")).is_visible()); A.emulate_media(media="screen")
    A.screenshot(path=O+"receipt-en.png", full_page=True)

    # 6. payment receipt for the rest
    S.goto(B+f"/stock/{sid}"); S.get_by_role("button", name="Receive payment").click(); S.wait_for_timeout(1500)
    pid=sql(f"SELECT id FROM {Q('\"CashEntry\"')} WHERE {Q('\"stockDocId\"')}='{sid}' ORDER BY {Q('\"createdAt\"')} DESC LIMIT 1")
    S.goto(B+f"/print/receipt/payment/{pid}"); txt=S.inner_text("main")
    ck("payment receipt: 200,000 received for the sale, nothing remaining", "وصل قبض" in txt and "200,000 IQD" in txt and "SAL-" in txt and "فقط مائتان ألف دينار عراقي لا غير" in txt and "0 IQD" in txt)
    A.goto(B+"/receipts/new"); A.get_by_label("Used for").select_option("PAYMENT"); A.get_by_label("Layout name").fill("Small payment slip"); A.get_by_label("Paper").select_option("A5")
    pv=A.get_by_test_id("receipt-preview").inner_text(); ck("payment layout previews the real payment", "RCV-" in pv)
    A.get_by_role("button", name="Save layout").click(); A.wait_for_url(re.compile(r".*/receipts\?saved="))
    S.goto(B+f"/print/receipt/payment/{pid}"); ck("payment receipt uses the A5 payment layout", "Small payment slip" in S.inner_text("main") and S.locator(".receipt-page").evaluate("e => e.style.width")=="148mm")

    # 7. purchase receipt
    sql(f"INSERT INTO {Q('\"CashEntry\"')} (id,number,kind,{Q('\"safeId\"')},currency,amount,{Q('\"createdById\"')}) SELECT 'cashseed','CIN-T','DEPOSIT','safe_main','USD',1000,id FROM {Q('\"User\"')} WHERE username='owner'")
    stock_doc(A, B, "BUY", [("P-200",100,"1.5")], party="Gulf Polymers", currency="USD", paid="150")
    bid=A.url.split("/")[-1].split("?")[0]; A.goto(B+f"/print/receipt/doc/{bid}"); txt=A.inner_text("main")
    ck("purchase receipt says customer and purchase invoice", "فاتورة شراء" in txt and "اسم الزبون" in txt and "Gulf Polymers" in txt and "150 USD" in txt)

    # 8. permissions
    S.goto(B+"/receipts/new"); ck("sales manager can't make layouts", "/forbidden" in S.url)
    S.goto(B+"/dashboard"); ck("…and has no Receipts in the menu", S.locator("a[href='/receipts']").count()==0)
    S.goto(B+f"/print/receipt/doc/{sid}"); ck("…but can print the sale", "Al Noor Market" in S.inner_text("main"))
    lid=sql(f"SELECT id FROM {Q('\"ReceiptLayout\"')} LIMIT 1")
    ck("audit has layout create and print", {"receipt.layoutCreate","receipt.print"}<=set(sql(f"SELECT DISTINCT action FROM {Q('\"AuditLog\"')}").split("\n")))

    # 9. edit / delete; default moves
    A.goto(B+"/receipts"); A.get_by_role("link", name="Bereket A4 Arabic").click(); A.wait_for_load_state("networkidle")
    A.get_by_role("button", name="Delete layout").click(); A.wait_for_url(re.compile(r".*/receipts$"))
    ck("deleting the default makes the other sales layout default", sql(f"SELECT {Q('\"isDefault\"')} FROM {Q('\"ReceiptLayout\"')} WHERE name='Export English'")=="t")

    # 10. phone + Arabic screen
    M=ctx(**p.devices["iPhone 13"]); login(M,"owner",PW); over=[]
    for path in ["/receipts","/receipts/new",f"/stock/{sid}"]:
        M.goto(B+path); M.wait_for_load_state("networkidle")
        if M.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"phone layout fits ({over})", not over)
    A.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); A.goto(B+"/receipts"); ck("Arabic screen", "الوصولات" in A.inner_text("main"))
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
