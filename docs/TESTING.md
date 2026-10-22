# Testing

## What exists

| Suite | File | What it proves |
|---|---|---|
| Unit | `tests/unit/*.test.ts` (Vitest) | Order status rules (derived only from records; never "Delivered" without shipments) |
| Acceptance | `tests/e2e/acceptance.py` | All 18 acceptance criteria of the specification, starting from an **empty database**: setup → employees → master data → multi-product order → scheduling → partial production → breakdown + linked maintenance → QC hold & reject → receipts → partial and final shipments → consistency → history → search/reports/exports → mobile → audit → backend rejections → go-live reset |
| Security | `tests/e2e/security.py` | Authentication, authorisation, CSRF, sessions, headers, lockout, injection, XSS, uploads (see SECURITY.md) |
| Stage tests | `tests/e2e/stage1.py` … `stage7.py` | Each module's detailed workflows, written while it was built. Stages 3–5 assume the data their earlier stages created; run them in order on a fresh database |

## Latest results (22 Oct 2026)

- Unit: **10/10**
- Acceptance (fresh database): **48/48**
- Security: **28/28**
- Stage 6 (warehouse & shipments): **23/23**, Stage 7 (reports, exports, search, audit): **41/41**

## How to run

Prerequisites: Node.js 20+, PostgreSQL 14+, Python 3 with Playwright (`pip install playwright && playwright install chromium`). The Python tests read the database with `psql` as the `postgres` user to verify results independently of the app.

```bash
npm test                                   # unit tests
npm run build

# Security + stage tests against the development database (with demo accounts)
npm run demo:add
npx next start -p 3000 &
python3 tests/e2e/security.py
python3 tests/e2e/stage7.py

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
- Print a delivery note and a report (Save as PDF).
