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

### Labels, raw materials and packaging by hand, and their cost
- **Products → New item** (or **New item** on Warehouse Stock): choose **Label**, **Raw material** or **Packaging**, type the name, **Counted in** pieces or kg (packaging bought by kg but used by the bag: also the weight of one bag), and the **cost**. Leave the code empty for an automatic one (LBL-0001, MAT-0001, PKG-0001). Import from Excel still works for long lists.
- **Cost** = price of 1 piece / 1 kg + currency. For **USD or EUR** the form asks the rate of the day (1 USD = ? IQD) — you type it every time; nothing is filled in for you. The price stays in its own currency, and its IQD value is what product costs use.
- Change a cost on the item's page (**Change cost**). Buying and production never change a cost — only you do.
- **What a product costs** (product page → *Product cost*): type the **pieces made** (it starts at the product's last production, or one full carton if it was never made). The cost is worked out the accountant's way, with the same amounts production takes from stock: label 1 per piece, materials by their grams, **full cartons and bags** (a started one counts — 1,000 pieces with 880 in a carton = 2 cartons), and nylon by the kg of those bags. Total ÷ pieces = **cost of one piece**. Items without a cost are named in orange and left out of the total.
- **Warehouse Stock** (money roles): every row shows the **cost per unit** (products: cost per piece at their last production quantity, or one full carton) and the **value in stock** = stock × cost, always in IQD. At the top, **Stock value** shows the value of one section (Products, Labels, Raw materials, Packaging) or **All** together with each section listed. Items without a cost show — and are counted as "not counted" in orange; stock below zero has no value. * means some of a product's items have no cost yet.
- **Items workbook (Excel)** — the fast way to fill in everything (Warehouse Stock or Products → *Items workbook (Excel)*): **Download items workbook** gives one Excel file with sheets *Labels, Raw materials, Packaging, Products, Made of & packaging*, already filled with every item in the system, its stock now and its cost. Fill in what is missing or wrong (unit, weight of one bag, cost price + currency + rate for USD/EUR, mold, label, QC, made of & packaging) and add new items in new rows (empty Code = automatic code). **Counted stock**: what is on the shelf now — the stock is set to it with one Input / Output count document (empty = unchanged). Upload → **Check file** lists what will change and every mistake by sheet and row → **Save everything**. Rows are matched on their code (a row without a code is matched by its name); empty cells never delete anything; grey columns are only for information. Needs Products: Create + Edit; costs need a money role; counted stock needs Stock movements Input / Output. On *Made of & packaging*, rows that are left empty are skipped, and a **label** listed under a product becomes that product's label.
- Costs are shown only to roles that can **Buy**, **Sell** or **view the Safe** (like all money). Others still see items and stock.
- Production still takes the label, materials and packaging out of stock exactly as before.
- **Plastic handles made in the factory** are products with their own made-of (granules, dye). Put the handle in a bucket's *Made of* (pieces per piece = 1): its cost per piece is the handle's own cost, and making buckets takes handles out of stock. A **metal handle** is a bought raw material with its own cost.

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
Every manual change of stock is one numbered document. Press one of the four buttons, pick a **Section** (All · Products · Labels · Raw materials · Packaging) to list only those items, choose the items, type the quantities and save. Bought items go into their own section of the warehouse.
| Document | Number | Money | You fill in |
|---|---|---|---|
| **Input** | IN-2026-0001 | no | reason: return, transfer, count correction, other |
| **Output** | OUT-2026-0001 | no | reason: damage/scrap, sample, transfer, count correction, other |
| **Buy** | BUY-2026-0001 | yes | **supplier** (choose from the list or **New supplier**), the supplier's own invoice no. (optional), currency IQD, USD or EUR — for USD/EUR the **rate of the day** (1 USD = ? IQD, typed by you), price per unit, discounts, **paid now** (taken from the safe). Our purchase number PUR-2026-0001 is given automatically |
| **Sell** | SAL-2026-0001 | yes | **customer** (choose from the list or **New customer**), delivery place, currency, price per unit, discounts, **received now** (goes into the safe); optionally the order — the list button fills the lines from the order. The invoice number INV-2026-0001 is given automatically |
- Under each line you see the stock now and after saving. If it would go below zero you are warned, but you can still save (the warehouse is notified).
- Kg items can have 3 decimals (25.250); pieces must be whole numbers.
- Daily production and what it uses (labels, materials, cartons, nylon) still change stock automatically.
- A sale linked to an order shows on that order (**Sold** column + list of sales).
- Report **Buying and selling** lists every bought/sold line with totals per currency (CSV / Excel / PDF).
- **Who can do what** is set per role in Administration → Roles → *Stock movements*: View, Input, Output, Buy, Sell. Warehouse Team has Input and Output; switch Buy/Sell on for the roles that need them.

## Suppliers (accounts, what we owe)
- **Suppliers** in the menu works like Customers: each supplier has a **code** (S-0001, automatic, can be changed), one balance per currency, a statement and **Pay the supplier** (money out of a chosen safe; more than owed is allowed = paid in advance). **Minus (−, red) = the factory owes the supplier.**
- Every purchase is booked to a supplier. Old purchases were moved into supplier accounts by name; the invoice number typed on them is kept as *Supplier's invoice no.*
- **Discount when buying**: per line and on the whole purchase, % or amount. It only lowers what is owed to the supplier; the item's price on the line (and its cost) stays the bought price.
- **Buying in USD or EUR**: the supplier is owed in that currency; the form asks the **rate of the day** and shows the purchase's value in IQD. An item's cost is only changed by hand (item page or Items workbook).
- **Paid now / Received now starts at 0** on every purchase and sale. Type what was really paid, or press **Paid in full**.
- Permissions: Administration → Roles → *Suppliers*: View, Manage (given automatically to roles that can Buy or view the Safe).

## Customers (accounts, balances, discounts)
- **Customers** in the menu lists every customer with a **code** (C-0001, given automatically; you can change it) and their balance. Search by code, name or phone; filter **Owes us** or **Archived**.
- Each customer has **one running balance per currency**: sales lower it, money received raises it. **Minus (−, red) = the customer owes the factory**; plus (green) = the factory owes the customer.
- The customer page shows the balance, the account statement (every sale and payment with the running balance), **Receive payment** (money in from that customer, not tied to one invoice; more than owed is allowed), **Edit**, **Archive** and **New sale**.
- Selling: choose the customer — their phone fills in and you see their balance before and after this sale. **Delivery place** is where the goods go. **Discount** per line and/or on the whole invoice, as **%** or **an amount** (it can't be more than the line/invoice).
- The sale's receipt shows the customer code, delivery place, discounts, subtotal, grand total, **previous balance, paid now and new balance** (minus = the customer owes). A payment receipt shows the balance before and after.
- Old sales were moved into customer accounts automatically by name (same name written in different upper/lower case or spacing counts as one customer). Purchases are not part of customer accounts.
- Permissions: Administration → Roles → *Customers*: View, Manage. Roles that can Sell or view the Safe got them automatically. Someone who may Sell can add a new customer while selling.

## Safes (money)
You can have **several safes** (e.g. *Main safe*, *Dollar box*, *Office safe*). Each has its own name and holds the currencies chosen for it; **IQD, USD and EUR are always kept apart**. Open **Safe** in the menu: the top shows all safes together, then one card per safe — click a card to see only that safe's movements.
| What | Number | Effect |
|---|---|---|
| **Money in** | CIN-2026-0001 | adds money by hand (owner, bank…) to the safe you choose; write where it came from |
| **Money out** | COUT-2026-0001 | an expense from the safe you choose; choose what it was spent on (Salaries, Electricity, Fuel/generator, Rent, Maintenance, Transport, Food, Other, or your own) |
| **Exchange** | EXC-2026-0001 | three boxes: **amount you give**, **rate** and **amount you receive** — type any two, the third is calculated (shaded). The rate is always "1 USD = … IQD" (1 of the stronger currency). The money can go into another safe, e.g. 1,000 USD from *Main safe* → 1,450,000 IQD into *Office safe* |
| **Transfer** | TRF-2026-0001 | moves the same currency from one safe to another, e.g. 500 USD from *Dollar box* to *Main safe*; the total doesn't change |
| Sale payment | RCV-2026-0001 | from the "received now" of a Sell, **Receive payment** on the sale, or **Receive payment** on the customer — choose **Into safe** |
| Purchase payment | PAY-2026-0001 | from the "paid now" of a Buy, or later with **Pay** on the purchase — choose **Paid from safe** |
- Money can never leave a safe if **that safe** doesn't have enough of that currency (other safes don't count) — the button turns off and the server refuses it.
- **Safes** tab (needs *Safe: Manage*): **New safe** → name + tick the currencies it holds. **Edit** renames it or changes its currencies (a currency can be removed only when that safe has none of it). **Delete** only for a safe that was never used. The *Main safe* (where all money before 26 Oct 2026 is) can be renamed but not deleted.
- People who sell but can't see the Safe choose the safe by name only — they don't see what is in it.
- **Still owed** tab: customers with a minus balance (click to open their account), and what we still owe suppliers per purchase.
- **Total value of the safe**: type 1 USD = … IQD and 1 EUR = … IQD to see all safes as one total (starts at the last exchange rate). This is only a calculation; it changes nothing.
- **Expense categories** tab (needs *Safe: Manage*): add your own, hide ones you don't use.
- Report **Safe: money in and out** (Reports → Money) has a **Safe** column and totals per currency; CSV/Excel/PDF.
- Permissions in Administration → Roles → *Safe (money)*: View, Money in, Money out, Exchange, **Transfer between safes**, Manage, Export. Roles that could exchange got Transfer automatically. A person who may **Sell** can always record what the customer paid; a person who may **Buy** can pay the supplier.

## Receipts (printing sales, purchases and payments)
- **Receipts** in the menu (needs *Receipts: Manage*) lists the saved layouts. **New layout**: name, used for (Sales / Purchases / Payment received later), language (Arabic, English, Turkish or Arabic + English), paper (A4 / A5), text size, margin, colour, **banner picture on top**, title, text under the banner, text at the bottom, what to show (date, time, numbers, customer, phone, accountant, note, paid, remaining, total in words, signature boxes) and the item columns (tick and move up/down). The preview on the right shows your latest real sale as it will print.
- Tick **Use this layout first** for the layout to open by default; the first layout of each kind is the default automatically.
- To print: open the sale or purchase in Stock Movements → **Print receipt** → choose a layout at the top → **Print / Save as PDF**. Later payments have their own **Print** link (and Print receipt on the payment page).
- The Buy / Sell form has **Phone**. On a sale it fills in from the chosen customer.
- New fields you can tick in a layout: customer code, delivery place, balance (previous / paid now / new), and a **Discount** column (shown only when a line has a discount).

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
