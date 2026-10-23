# Build progress (resume notes)

Live: https://bereket-fms.vercel.app · Repo: github.com/Farhad800/berecket (main)
Vercel project `bereket-fms` (prj_ktkRemptQA9lvYn5YIsnmwHGIk2x, team team_noVyw99GRei6kEUIky96G7cI).
Deploy = push to main, then Vercel MCP `create_deployment` with gitSource {github, Farhad800/berecket, main};
wait until `<deployment-url>/api/health` returns {"status":"ok"} and readyState READY.

Stages 1–7: done (see README). Stage 8 checklist:

- [x] Go-live data tools: admin "System" tab (remove demo employees, reset test data) + CLI scripts
- [x] Error logging (instrumentation onRequestError) + health check
- [x] Security tests (tests/e2e/security.py) and fixes
- [x] Acceptance tests from a fresh database (tests/e2e/acceptance.py, spec section 18)
- [x] Automated backups (GitHub Actions pg_dump + blob files) and restore guide
- [x] Docs: DEPLOYMENT, OPERATIONS, BACKUP-RESTORE, SECURITY, TESTING, USER-GUIDE
- [x] Deploy + live smoke test + final report (deployment dpl_5Wh3HL3QDYyr3GYZ78Jzp5VHkc5z, 22 Oct 2026)

Notes
- Do NOT add app-wide `loading.tsx`: in Next 15.5 it made server-action redirects and
  search-param navigations hang. Removed in Stage 7.
- Local: Postgres `bereket` (bereket/bereket_dev); admin/Bereket2026Admin; demo users password Demo12345!
- Older stage e2e tests (3–5) depend on the data state they were written against; run the suite on a fresh DB.

## Status: all 8 stages complete (22 Oct 2026)
Results: acceptance 48/48 (fresh DB), security 28/28, stage 6 23/23, stage 7 41/41, unit 10/10, npm audit 0.
Open items for the owner: Vercel Pro (commercial use), Neon Launch + 7-day history, GitHub backup secrets,
repo private, BLOB token Sensitive, SETUP_TOKEN rotated (done), native-speaker review of ar/tr texts,
go-live reset when testing ends.

## Redesign (started 23 Oct 2026) — owner's decisions
- Remove Production Schedule (jobs) completely. Production = daily entries: date + shift + product + good qty (no machine, no defects, no order link).
- Orders = order number + product lines + amounts only. No customer, no date, no priority, no notes. Status: Open / Completed / Cancelled.
- Remove customers completely.
- Warehouse = stock only: production entries add stock automatically; warehouse records stock out + adjustments. No shipments, no delivery notes, no receipts, no locations.
- QC inspects daily production entries (accept/reject pieces, defect type, quality issues + corrective actions). Rejected pieces leave stock.
- Maintenance/service stay (no job links). Downtime records dropped (were tied to jobs).
Checklist:
- [ ] schema + migration  - [ ] orders  - [ ] daily production  - [ ] QC + warehouse
- [ ] cleanup (nav, perms, dashboard, reports, search, history, service, go-live tools, demo, i18n)
- [ ] tests (new acceptance), docs, deploy
