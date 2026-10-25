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

## Warehouse (stock on hand — read only)
The warehouse only **shows** what is in stock. It has five tabs: **Products**, **Labels**, **Raw materials** (granules, dyes, regrind), **Packaging** (nylon, cartons, stretch film, tape, pallets) and **Movements**. Nothing can be typed here; a number below zero is shown in red so it can be counted and corrected.

## Stock Movements (Input · Output · Buy · Sell)
Every manual change of stock is one numbered document. Press one of the four buttons, choose the items (any product, label, material or packaging), type the quantities and save.
| Document | Number | Money | You fill in |
|---|---|---|---|
| **Input** | IN-2026-0001 | no | reason: return, transfer, count correction, other |
| **Output** | OUT-2026-0001 | no | reason: damage/scrap, sample, transfer, count correction, other |
| **Buy** | BUY-2026-0001 | yes | supplier name, invoice no. (optional), currency IQD, USD or EUR, price per unit, **paid now** (taken from the safe) |
| **Sell** | SAL-2026-0001 | yes | customer name, invoice no. (optional), currency, price per unit, **received now** (goes into the safe); optionally the order — the list button fills the lines from the order |
- Under each line you see the stock now and after saving. If it would go below zero you are warned, but you can still save (the warehouse is notified).
- Kg items can have 3 decimals (25.250); pieces must be whole numbers.
- Daily production and what it uses (labels, materials, cartons, nylon) still change stock automatically.
- A sale linked to an order shows on that order (**Sold** column + list of sales).
- Report **Buying and selling** lists every bought/sold line with totals per currency (CSV / Excel / PDF).
- **Who can do what** is set per role in Administration → Roles → *Stock movements*: View, Input, Output, Buy, Sell. Warehouse Team has Input and Output; switch Buy/Sell on for the roles that need them.

## Safe (money)
The safe keeps **IQD, USD and EUR apart** — each has its own balance. Open **Safe** in the menu.
| What | Number | Effect |
|---|---|---|
| **Money in** | CIN-2026-0001 | adds money by hand (owner, bank…); write where it came from |
| **Money out** | COUT-2026-0001 | an expense; choose what it was spent on (Salaries, Electricity, Fuel/generator, Rent, Maintenance, Transport, Food, Other, or your own) |
| **Exchange** | EXC-2026-0001 | e.g. 1,000 USD → 1,450,000 IQD at the rate you got: USD goes down, IQD goes up |
| Sale payment | RCV-2026-0001 | made automatically from the "received now" of a Sell, or later with **Receive payment** on the sale |
| Purchase payment | PAY-2026-0001 | made automatically from the "paid now" of a Buy, or later with **Pay** on the purchase |
- Money can never leave the safe if there isn't enough of that currency — the button turns off and the server refuses it.
- **Still owed** tab: what customers still owe us and what we still owe suppliers, per document.
- **Total value of the safe**: type 1 USD = … IQD and 1 EUR = … IQD to see everything as one total (starts at the last exchange rate). This is only a calculation; it changes nothing.
- **Expense categories** tab (needs *Safe: Manage*): add your own, hide ones you don't use.
- Report **Safe: money in and out** (Reports → Money) with totals per currency; CSV/Excel/PDF.
- Permissions in Administration → Roles → *Safe (money)*: View, Money in, Money out, Exchange, Manage, Export. Only the Administrator has them at first. A person who may **Sell** can always record what the customer paid; a person who may **Buy** can pay the supplier.

## Receipts (printing sales, purchases and payments)
- **Receipts** in the menu (needs *Receipts: Manage*) lists the saved layouts. **New layout**: name, used for (Sales / Purchases / Payment received later), language (Arabic, English, Turkish or Arabic + English), paper (A4 / A5), text size, margin, colour, **banner picture on top**, title, text under the banner, text at the bottom, what to show (date, time, numbers, customer, phone, accountant, note, paid, remaining, total in words, signature boxes) and the item columns (tick and move up/down). The preview on the right shows your latest real sale as it will print.
- Tick **Use this layout first** for the layout to open by default; the first layout of each kind is the default automatically.
- To print: open the sale or purchase in Stock Movements → **Print receipt** → choose a layout at the top → **Print / Save as PDF**. Later payments have their own **Print** link (and Print receipt on the payment page).
- The Buy / Sell form now has **Phone**. Typing a customer you used before fills in their phone.

## Who sees money
Prices, totals, payments, what is still owed, customer/supplier phones, printed receipts and the **Buying and selling** report are shown only to people whose role can **Buy**, **Sell** or **view the Safe**. Everyone else who follows stock (for example the Warehouse Team) still sees every document and quantity, and gets "Purchase BUY-…: n items" / "Sale SAL-…: n items" notices without amounts. To let someone see money, give their role Stock movements → Buy or Sell, or Safe → View (Administration → Roles).

## Temporary passwords
A new employee or someone whose password was reset can do nothing until they choose their own password — not even through a saved link or a download. Only the Change password page and the language switch work.

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
