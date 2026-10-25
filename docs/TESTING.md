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
| Stage 1 | `tests/e2e/stage1.py` | Sign-in, roles, languages, install banner. (Older stage 2–9 suites were retired with the 23 Oct 2026 simplification; the acceptance suite covers those flows.) |

## Latest results (22 Oct 2026)

- Unit: **10/10**
- Acceptance (fresh database): **48/48**
- Security: **28/28**
- Simplified workflow (23 Oct 2026): acceptance **56/56**, security **28/28**, unit **6/6**
- Daily sheet / large orders / deletes: **26/26**
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
