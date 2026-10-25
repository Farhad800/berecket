"""Shared helper: fill and save one Stock Movements document (Input / Output / Buy / Sell) through the UI."""
import re
def stock_doc(pg, B, typ, lines, reason=None, party=None, currency=None, invoice=None, order=None, paid=None, save=True):
    """lines = [(search text, qty, price or None)]. Returns the page text after saving (or the form text if save=False)."""
    pg.goto(B+f"/stock/new?type={typ}"); pg.wait_for_load_state("networkidle")
    if reason: pg.get_by_label("Reason").select_option(reason)
    if party: pg.get_by_label(re.compile("^(Supplier|Customer)$")).fill(party)
    if invoice: pg.get_by_label("Invoice").fill(invoice)
    if currency: pg.get_by_label("Currency").select_option(currency)
    if order: pg.get_by_label("Order (optional)").select_option(label=order)
    for i, (text, qty, price) in enumerate(lines):
        if i: pg.get_by_role("button", name="Add item").click()
        row = pg.locator("main ul.divide-y > li").nth(i)
        row.locator("[id^=item_]").click(); pg.keyboard.type(text); pg.wait_for_timeout(250)
        exact = pg.locator("[role=option]").filter(has=pg.locator("span.text-xs", has_text=re.compile("^"+re.escape(text)+" ·")))
        if exact.count(): exact.first.click()
        else: pg.keyboard.press("Enter")
        row.locator("input[type=number]").nth(0).fill(str(qty))
        if price is not None: row.locator("input[type=number]").nth(1).fill(str(price))
    if paid is not None: pg.get_by_label(re.compile("^(Paid now|Received now)$")).fill(str(paid))
    if not save: return pg.inner_text("main")
    pg.get_by_role("button", name=re.compile("^Save (input|output|purchase|sale)")).click()
    try: pg.wait_for_url(re.compile(r".*/stock/[^/]+\?saved=1$"), timeout=15000)
    except Exception: pass
    pg.wait_for_load_state("networkidle"); return pg.inner_text("main")
