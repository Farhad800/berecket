# Quick guide for each department

Sign in at **https://bereket-fms.vercel.app** with your own username. Your first password is temporary — choose your own. On a phone, tap **Install** (or browser menu → *Add to Home Screen*) to use it like an app. Change language with the globe icon. Everyone can *see* all factory records; buttons appear only for what your role may do. Search any number (order, product, machine, mold, inspection…) from the box at the top or press **/*## Setting up products, molds and machines (once)
- **Many at once — Excel:** Products → **Import from Excel** → *Download Excel template*. Fill the sheets *Machines*, *Molds* and *Products* (one row per label, with its mold code; product code can stay empty and is then made automatically, e.g. `MD-CAP28-001`). Upload → **Check file** shows how many are new/updated and lists any mistakes by row → **Import**. Importing the same file again updates rows instead of copying them.
- **All labels of one mold — paste:** Machines & Molds → Molds → **Add labels** on the mold → paste the label names, one per line (a whole column copied from Excel works) → *Save*. Labels already on that mold are skipped.
- Every printed label is its own product, linked to the mold it is made on. Products, the order sheet, the daily production sheet and the stock sheet all have a **mold** filter so 500+ labels stay easy to find.

## Products: label, made of & packaging
- **New product** (Products → New product): pick its **label** first — the name and second name come from the label (only products without a label get a typed name). Enter the code, mold and QC flag, then in the same form add:
  - **Made of** (per piece): raw materials and colours in grams per piece, handles and other parts in pieces per piece.
  - **Packaging**: each carton or nylon with **how many products go into one** (e.g. carton 1,800 · nylon 60).
  - The panel on the right shows what any number of pieces will use.
- Existing products: open a product (Products → **Made of & packaging**) to change the same things.
- Nylon is stocked in kg: open the nylon item once and enter the **weight of one bag**.
- When daily production is saved, the label (1 per piece), materials, cartons and nylon are taken from stock automatically. Started cartons and bags count as used. Corrections give back or take the difference. If something isn't in stock, production is still saved, stock shows minus (red) and the warehouse gets a notification.
- Excel: Products sheet *Label code* and *Weight per bag (kg)* columns; a **Recipe** sheet (Product code, Item code, Quantity, Per = piece or pack) sets many products at once.

## Sales
1. **Orders → New order**: the whole product list is shown as one sheet. Type the amount next to each product you need and leave the rest empty (Enter jumps to the next box; *Show only chosen* hides the empty ones). Press **Save order**. Up to 500 products per order. No customer or date is needed.
2. While an order is **Open** you can *Edit* it (change amounts, add or remove products). Mark it **Completed** when everything has been delivered, or **Cancel** it (reason needed). A completed or cancelled order can be *Reopened*.
3. An order typed by mistake can be removed with **Delete order** (reason needed; recorded in the audit log).
4. The order page shows, for each product, how many pieces are **in stock** right now.

## Production
1. **Daily Production → Daily entry sheet**: pick the date and shift, type how many pieces were produced for each product, then **Save all** once. By default only products that are in open orders are listed — untick the box to see every product. Entering the same product again for the same day and shift adds to the earlier figure.
2. Saved quantities go into warehouse stock **automatically**.
3. The **Daily Production** page shows each day's entries and totals per shift (use the arrows to move between days). A typing mistake can be fixed with **Correct** (reason needed; 0 deletes the entry) until QC has inspected that entry.
4. Machine problem: **Technical Service → New request**, tick *Machine down*.

d.

## Technical Service
1. **Technical Service → Maintenance requests**: new requests appear here and as notifications. *Start work*, *Waiting for parts*, *Repair completed* (describe the repair). Add photos/PDFs.
2. **Daily service report**: what you did, mold removed/installed and why, spare parts, downtime minutes.
3. **Preventive maintenance** tasks show what is due. **Mold & Machine History** shows every repair, machine-down time and mold change per machine or mol## Quality Control
1. **Quality Control → To inspect**: the last 14 days of production entries, products marked *QC required* first. Open an entry, enter how many pieces you inspected and how many you reject.
2. No rejects → **Approve**. Rejected pieces need a defect type and description → a quality issue (NCR) is opened and the rejected pieces are **removed from stock automatically**.
3. Record corrective actions on the issue; send it to maintenance for a machine if needed; verify and close it when fixed.
4. QC also verifies completed repairs.

## Warehouse
The warehouse has five tabs: **Products**, **Labels**, **Raw materials** (granules, dyes, regrind), **Packaging** (nylon, cartons, stretch film, tape, pallets) and **Movements**.
- **Stickers / Materials:** choose **Received (in)** when a delivery arrives or **Used (out)** when it goes to production, type the quantity next to each item (kg can have decimals, e.g. 25.5), add a reference (supplier, invoice, machine) and save. You can't use more than is in stock.
1. **Warehouse Stock**: current stock of every product (it rises from production and falls with QC rejects and goods going out — totals can't be typed in).
2. Goods leaving: type the pieces going out next to each product, add a reference (order number, truck…) and press **Take out**. You can't take out more than is in stock.
3. Stock corrections (count differences, damage, scrap) need a reason and supervisor permission (*Warehouse: approve*).
4. **Movements** lists every stock change with who did it.

n.

## Notifications on your phone and computer
- After signing in, tap **Turn on notifications** (or open the bell → *Notifications on this device*). Allow when the browser asks. Do this once on each phone and computer.
- New and removed orders, daily production, QC results, goods out, stock adjustments, machine breakdowns, repairs and new or deleted products/molds/machines then pop up **even when the app or browser is closed**. You never get a notification for something you did yourself.
- **iPhone:** first install the app (Safari → Share → *Add to Home Screen*), open it from the home screen, then turn notifications on.
- **Blocked?** Open the browser's site settings (lock icon next to the address) → Notifications → Allow. On Android also check Settings → Apps → Chrome → Notifications.
- Signing out stops notifications on that device until you sign in again.

## Management / everyone
- **Dashboard**: live figures — tap any card to open the records behind it.
- **Reports & Analytics**: 11 reports (production output, daily entries, orders, ordered vs. stock, maintenance, mold changes, defects, rejection rates, corrective actions, stock, stock movements). Pick dates and filters; export to Excel (CSV) or PDF if your role allows.
- **Notifications** (bell): new orders, breakdowns, QC rejections, critical quality issues — only those relevant to your role.
