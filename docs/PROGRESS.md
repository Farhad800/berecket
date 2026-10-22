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
