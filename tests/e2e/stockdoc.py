"""Shared helper: fill and save one Stock Movements document (Input / Output / Buy / Sell) through the UI."""
import re
def pick_customer(pg, name, phone=None):
    """Sell: choose the customer account by name, or add it with the New customer box."""
    pg.locator("[id=customerId]").click(); pg.keyboard.type(name); pg.wait_for_timeout(250)
    hit = pg.locator("[role=option]").filter(has=pg.locator("span.flex-1").get_by_text(name, exact=True))
    if hit.count(): hit.first.click(); return
    pg.keyboard.press("Escape"); pg.locator("main h1").first.click()
    pg.get_by_role("button", name="New customer").first.click()
    pg.get_by_label("Customer name").fill(name)
    if phone: pg.get_by_label("New customer's phone").fill(phone)
    pg.get_by_role("button", name="Add customer").click(); pg.wait_for_timeout(1200)

def stock_doc(pg, B, typ, lines, reason=None, party=None, currency=None, invoice=None, order=None, paid=None, save=True, phone=None, delivery=None, discount=None):
    """lines = [(search text, qty, price or None[, (discount value, "%" or "amount")])].
    discount = (value, "%" or "amount") on the whole invoice (sales). Returns the page text after saving (or the form text if save=False)."""
    pg.goto(B+f"/stock/new?type={typ}"); pg.wait_for_load_state("networkidle")
    if reason: pg.get_by_label("Reason").select_option(reason)
    if party and typ == "SELL": pick_customer(pg, party, phone)
    elif party: pg.get_by_label(re.compile("^(Supplier|Customer)$")).fill(party)
    if phone and typ != "SELL": pg.get_by_label("Phone").fill(phone)
    if delivery: pg.get_by_label("Delivery place").fill(delivery)
    if invoice: pg.get_by_label("Invoice").fill(invoice)
    if currency: pg.get_by_label("Currency").select_option(currency)
    if order: pg.get_by_label("Order (optional)").select_option(label=order)
    for i, line in enumerate(lines):
        text, qty, price = line[:3]
        if i: pg.get_by_role("button", name="Add item").click()
        row = pg.locator("main ul.divide-y > li").nth(i)
        row.locator("[id^=item_]").click(); pg.keyboard.type(text); pg.wait_for_timeout(250)
        exact = pg.locator("[role=option]").filter(has=pg.locator("span.text-xs", has_text=re.compile("^"+re.escape(text)+" ·")))
        if exact.count(): exact.first.click()
        else: pg.keyboard.press("Enter")
        row.locator("input[type=number]").nth(0).fill(str(qty))
        if price is not None: row.locator("input[type=number]").nth(1).fill(str(price))
        if len(line) > 3 and line[3]:
            row.locator("input[type=number]").nth(2).fill(str(line[3][0]))
            row.locator("select").first.select_option("PERCENT" if line[3][1] == "%" else "AMOUNT")
    if discount:
        pg.get_by_label("Discount on the whole invoice").fill(str(discount[0]))
        pg.get_by_label("Invoice discount type").select_option("PERCENT" if discount[1] == "%" else "AMOUNT")
    if paid is not None: pg.get_by_label(re.compile("^(Paid now|Received now)$")).fill(str(paid))
    if not save: return pg.inner_text("main")
    pg.get_by_role("button", name=re.compile("^Save (input|output|purchase|sale)")).click()
    try: pg.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$"), timeout=15000)
    except Exception: pass
    pg.wait_for_load_state("networkidle"); return pg.inner_text("main")
