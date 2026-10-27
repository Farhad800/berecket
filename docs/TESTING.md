# Testing

## What exists

| Suite | File | What it proves |
|---|---|---|
| Unit | `tests/unit/*.test.ts` (Vitest) | Permissions after the simplification; production day handling |
| Acceptance | `tests/e2e/acceptance.py` | Spec section 18 adapted to the simplified workflow, from an **empty database**: setup → employees → products/machines/molds → order as a product sheet (edit, 60-product order, delete) → daily production per shift (merge, correction) → breakdown + maintenance → QC approve & reject (stock reduced, NCR) → Output documents (warned below zero) + damage output → ledger consistency → order completed + history → search/reports/exports → mobile → audit → backend rejections → go-live reset |
| Security | `tests/e2e/security.py` | Authentication, authorisation, CSRF, sessions, headers, lockout, injection, XSS, uploads (see SECURITY.md) |
| Bulk master data | `tests/e2e/bulk.py` | Excel template → 4 machines, 35 molds, 525 labels imported in one go; re-import makes no copies; wrong rows refused with row numbers; CSV; pasting labels onto a mold; mold filters on all sheets; permissions; phone layout |
| Push notifications | `tests/e2e/push.py` | A fake push service receives what the server sends; the payload is decrypted exactly as a phone does (RFC 8291) and is in the reader's language; actor not notified; dead devices removed; service worker pops the notification up; on/off card; first-visit banner. Start the app with `NODE_EXTRA_CA_CERTS` pointing at the test certificate (see the file header) |
| Stickers & materials | `tests/e2e/supplies.py` | Loads the factory's accounting list (975 products, 811 stickers, 74 materials) on an empty database; only products appear on order/daily sheets; buy/output stickers through Stock Movements; kg with decimals; warning before going below zero; re-import makes no copies |
| Made of & packaging | `tests/e2e/recipes.py` | Final accounting list; recipe built on the product page; 2,000 pcs → 2,000 labels, 90 kg granules, 1.8 kg dye, 2 cartons (rounded up), 34 nylon bags = 0.408 kg; merge, shortage warning with minus stock, correction and deletion give stock back; new product named from its label; Recipe sheet import |
| Stock movements | `tests/e2e/stock-docs.py` | Input/Output/Buy/Sell documents with numbers; prices & IQD/USD totals; refusals (no supplier, no price, no reason); sale filled from an order and shown on it; below-zero warning, saved anyway; read-only warehouse; per-role permissions (warehouse team Input/Output only, sales view only); trade report + CSV; search; audit; notifications; phone; Arabic; go-live reset. Shared form helper: `tests/e2e/stockdoc.py` |
| Safe | `tests/e2e/safe.py` | Money in/out/exchange per currency (IQD/USD/EUR kept apart); refusals (no source, no category, more than the safe has — UI and server); converter at last rate; EUR purchase unpaid then paid in parts (can't overpay); sale part-received then rest received by the sales manager; still-owed tab; per-role access (sales view only, warehouse none, money report hidden); categories add/hide; report + CSV; search; audit; notifications; phone; Arabic; go-live reset |
| Receipts | `tests/e2e/receipts.py` | Phone saved on a sale and filled for a known customer; standard receipt without layouts; layout with uploaded banner, header text, extra fields and column order, live preview of the real sale; default rules; English layout (LTR, second names, words); print view hides the toolbar; payment receipt (A5 layout) and purchase receipt; permissions; delete moves the default; phone; Arabic |
| Review fixes | `tests/e2e/review-fixes.py` | Password change keeps the device in use and signs out the others; a record deleted meanwhile gives a clear message. Prices with 6 decimals are covered in `stock-docs.py` and `tests/unit/money.test.ts` |
| Same-moment saves & kg | `tests/e2e/concurrency.py` | Fires requests at the same instant from threads straight at the server actions: same submission ×3, 4 people × 3 rounds on one product/shift, 6 multi-product sheets (no deadlock), 3 identical corrections, correction + new production, two inspectors over-rejecting, duplicate inspection, failed inspection rolled back then retried; browser double press and retry after a lost reply. After each step checks: entries = PRODUCTION stock, labels/materials used = recipe, rejected ≤ produced and = QC_REJECT stock, one uninspected entry per product/day/shift. M1: 1.001 / 0.999 kg accepted and stored exactly, 4 decimals refused |
| Money & temporary passwords | `tests/e2e/m3-m4.py` | M3: warehouse (no Buy/Sell/Safe) sees documents and quantities but no prices, totals, payments, phones — also not in the page data — no receipt, no money report/CSV/PDF even with export rights, notices without money; Sell role and owner see everything. M4: an Administrator on a temporary password replays real requests (stock input, money in, production, new employee) → all refused, nothing saved, downloads 403; after changing the password the same request works; an admin reset sends open sessions back to Change password |
| Customers & discounts | `tests/e2e/customers.py` | the accountant's 7 items: delivery place on sale/receipt; customer codes C-0001 automatic and editable, duplicate name refused, search by code; sale with line % and amount discounts + invoice discount (645,000 → 640,000); automatic INV-2026-0001/0002; balances −540,000 → −640,000 → +60,000 after a 700,000 payment; receipt previous/paid now/new balance with minus; statement and Still owed tab; trade report net of discounts (740,000); discount over 100% / over the line refused |
| Safes & exchange | `tests/e2e/safes.py` | several safes with own name/currencies (duplicate name refused, ≥1 currency); money in/out per safe, only that safe's currencies offered, limit per safe; exchange with three boxes — amount+rate, both amounts, received amount+rate (1,450 / 1,460 / 1,470→1,480), into another safe; transfer TRF between safes (total unchanged, limit, only safes holding the currency); safe chosen for sale received-now, later payment, purchase, customer payment; Sales without Safe view sees names only; rename/add currency, can't remove a currency still held, delete only unused; filter by safe, report Safe column, audit; phone + Arabic |
| Items & costs | `tests/e2e/items.py` | New item (label / raw material / packaging) with automatic codes, cost in IQD or USD with the rate asked (1.2 × 1,450 = 1,740), duplicate name refused, item without cost; product cost for the pieces made with full cartons and whole nylon bags (1,800 pcs → 53,157.2 = 29.53; 1,000 pcs → 29,766 = 29.77; 29.86 after a cost change); unit test reproduces the accountant's 1,000 pcs = 153,100.5 IQD; warehouse value per row and per section (PP 596.22 kg × 1,898 = 1,131,625.56; packaging 9,420; labels 80,000; products 53,754.44; All 1,274,800), missing costs named; warehouse cost columns; production still takes label 1,800 · PP 3.78 kg · 1 carton · 0.36 kg nylon; Buy section chips list only that section, supplier owed in USD, cost unchanged by buying; warehouse role sees no costs (not even in page data), Sales without money gets no cost box; phone + Arabic |
| Items workbook | `tests/e2e/workbook.py` | download lists every item (5 sheets, stock now, mold, label, made of & packaging); unchanged file changes nothing; mistakes by sheet/row block saving (missing rate, 2.5 cartons, material as packaging, product without code or mold); filled file: 6 costs (USD × rate), new LBL-0002 / DYE-BLK / P-200 with recipe, counted stock → one IN and one OUT count document (PP 96.5, cartons 25, nylon 3.25, label 1,000, product 480); same file again changes nothing; warehouse 403, Sales gets no cost columns and can't upload costs; phone + Arabic |
| Suppliers | `tests/e2e/suppliers.py` | buy needs a supplier (S-0001 made inline), automatic PUR-YYYY-0001 + supplier's invoice; paid / received start at 0, Paid in full; purchase discounts (200,000 − 10% − 5,000 = 175,000 owed; line keeps price 2,000); USD purchase asks the rate (75 × 1,460 = 109,500 IQD), refused without it, owed in USD, item cost unchanged; supplier list/page/statement, pay 100,000 from the safe, still-owed tab, purchase receipt with supplier code and balance; plastic handle 60 IQD → bucket 1,570 (metal handle 250 → 1,760), production takes handles from stock; warehouse can't open suppliers; phone + Arabic |
| Stage 1 | `tests/e2e/stage1.py` | Sign-in, roles, languages, install banner. (Older stage 2–9 suites were retired with the 23 Oct 2026 simplification; the acceptance suite covers those flows.) |

## Latest results (22 Oct 2026)

- Unit: **10/10**
- Acceptance (fresh database): **48/48**
- Security: **28/28**
- Simplified workflow (23 Oct 2026): acceptance **56/56**, security **28/28**, unit **6/6**
- Daily sheet / large orders / deletes: **26/26**
- Suppliers (27 Oct 2026, branch `suppliers`): suppliers **33/33**, workbook **32/32**, items **43/43**, safes **42/42**, safe **42/42**, customers **30/30**, stock-docs **36/36**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **28/28**. Migration tried on a copy with old purchases: suppliers made by name (case/space merged), payments linked, old invoice numbers kept as the supplier's invoice, amounts unchanged.
- Items workbook (27 Oct 2026, branch `items-workbook`): workbook **31/31**, items **43/43**, safes **42/42**, safe **42/42**, customers **30/30**, stock-docs **36/36**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **28/28**. The accountant's list (1,880 items) made into a workbook uploads cleanly: 813 labels, 39 raw materials, 35 packaging, 993 products; a second upload changes nothing.
- Warehouse stock value (27 Oct 2026, branch `stock-value`): items **43/43**, safes **42/42**, safe **42/42**, customers **30/30**, stock-docs **36/36**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **28/28**
- Product cost the accountant's way (27 Oct 2026, branch `batch-cost`): items **37/37**, recipes **21/21**, safes **42/42**, safe **42/42**, customers **30/30**, stock-docs **36/36**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **28/28**
- Item costs (26 Oct 2026, branch `item-costs`): items **35/35**, safes **42/42**, safe **42/42**, customers **30/30**, stock-docs **36/36**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **27/27**
- Safes (26 Oct 2026, branch `safes`): safes **42/42**, safe **42/42**, customers **30/30**, stock-docs **36/36**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **23/23**
- Customers (26 Oct 2026, branch `customers`): customers **30/30**, stock-docs **36/36**, safe **42/42**, receipts **29/29**, m3-m4 **29/29**, concurrency **29/29**, acceptance **57/57**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **19/19**
- M3/M4 (26 Oct 2026): m3-m4 **29/29** (same suite on the previous code: 12/29), concurrency **29/29**, acceptance **57/57**, stock-docs **36/36**, safe **42/42**, receipts **29/29**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **15/15**
- M1/M2 (26 Oct 2026): concurrency **29/29** (same suite on the old code: most checks fail — duplicates, stock +1,100, 1,200 of 1,000 rejected), acceptance **57/57**, stock-docs **36/36**, safe **42/42**, receipts **29/29**, review-fixes **6/6**, recipes **21/21**, supplies **21/21**, replace items **7/7**, bulk **28/28**, security **28/28**, push **16/16**, unit **15/15**
- Code review (26 Oct 2026): review-fixes **6/6**, stock-docs **36/36**, receipts **29/29**, safe **42/42**, acceptance **57/57**, security **28/28**, bulk **28/28**, push **16/16**, supplies **21/21**, recipes **21/21**, replace items **7/7**, unit **14/14**
- Receipts (25 Oct 2026): receipts **29/29**, safe **42/42**, stock-docs **32/32**, acceptance **57/57**, security **28/28**, bulk **28/28**, push **16/16**, supplies **21/21**, recipes **21/21**, replace items **7/7**, unit **10/10**
- Safe (25 Oct 2026): safe **42/42**, stock-docs **32/32**, acceptance **57/57**, security **28/28**, bulk **28/28**, push **16/16**, supplies **21/21**, recipes **21/21**, replace items **7/7**, unit **6/6**
- Stock movements (25 Oct 2026): stock-docs **32/32**, acceptance **57/57**, security **28/28**, bulk **28/28**, push **16/16**, supplies **21/21**, recipes **21/21**, replace items **7/7**, unit **6/6**

## How to run

Prerequisites: Node.js 20+, PostgreSQL 14+, Python 3 with Playwright (`pip install playwright && playwright install chromium`). The Python tests read the database with `psql` as the `postgres` user to verify results independently of the app.

```bash
npm test                                   # unit tests
npm run build

# Security + stage-1 tests against the development database (with demo accounts)
npm run demo:add
npx next start -p 3000 &
python3 tests/e2e/security.py
python3 tests/e2e/stage1.py

# Acceptance test from an empty database
bash tests/e2e/reset-accept-db.sh          # stop any server on :3001 first
DATABASE_URL=postgresql://bereket:bereket_dev@localhost:5432/bereket_accept \
DATABASE_URL_UNPOOLED=postgresql://bereket:bereket_dev@localhost:5432/bereket_accept \
SETUP_TOKEN=acceptance-setup-token-2026 npx next start -p 3001 &
python3 tests/e2e/acceptance.py
```

Screenshots from the runs are written to the scratch folder named at the top of each script.

## Manual checks before a release

- Sign in on a phone (Android Chrome and iPhone Safari), add to home screen, open offline → the offline page appears.
- Switch to Arabic: layout is right-to-left, numbers and codes stay readable.
- Print a report (Save as PDF).

## Read-only integrity check

`scripts/check-integrity.ts` lists production / QC records that do not add up (stock from production ≠ entries,
QC rejected more than produced or not matching stock, a product/day/shift split into several uninspected entries).
It runs in a READ ONLY transaction and changes nothing:

```bash
DATABASE_URL=... npx tsx scripts/check-integrity.ts
```
