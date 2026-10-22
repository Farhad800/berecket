# Build progress (resume notes)

Live: https://bereket-fms.vercel.app · Repo: github.com/Farhad800/berecket (main)
Vercel project `bereket-fms` (prj_ktkRemptQA9lvYn5YIsnmwHGIk2x, team team_noVyw99GRei6kEUIky96G7cI).
Deploy = push to main, then Vercel MCP `create_deployment` with gitSource {github, Farhad800/berecket, main};
wait until `<deployment-url>/api/health` returns {"status":"ok"} and readyState READY.

Stages 1–7: done (see README). Stage 8 checklist:

- [x] Go-live data tools: admin "System" tab (remove demo employees, reset test data) + CLI scripts
- [x] Error logging (instrumentation onRequestError) + health check
- [x] Security tests (tests/e2e/security.py) and fixes
- [x] Acceptance tests (47/48; item 16 needs docs) from a fresh database (tests/e2e/acceptance.py, spec section 18)
- [ ] Automated backups (GitHub Actions pg_dump + blob files) and restore guide
- [ ] Docs: DEPLOYMENT, OPERATIONS, BACKUP-RESTORE, SECURITY, TESTING, USER-GUIDE
- [ ] Deploy + live smoke test + final report

Notes
- Do NOT add app-wide `loading.tsx`: in Next 15.5 it made server-action redirects and
  search-param navigations hang. Removed in Stage 7.
- Local: Postgres `bereket` (bereket/bereket_dev); admin/Bereket2026Admin; demo users password Demo12345!
- Older stage e2e tests (3–5) depend on the data state they were written against; run the suite on a fresh DB.
