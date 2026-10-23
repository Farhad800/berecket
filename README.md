# Bereket Plastic — Factory Management System

Web application connecting Sales & Planning, Production, Technical Service, Quality Control and Warehouse.
Works in any browser on PC, tablet and phone, and can be installed to the home screen.

**Stack:** Next.js 15 (TypeScript) · Tailwind CSS · PostgreSQL · Prisma · server-side sessions · Vercel hosting.
**Languages:** English, Arabic (right-to-left), Turkish. Arabic and Turkish texts are machine-drafted and need review by a native speaker before go-live.

## Build status

| Stage | Scope | Status |
|---|---|---|
| 1 | Login, roles & permissions, employees, dashboard, branding, languages, install-to-home-screen | ✅ done |
| 2 | Products, machines & molds, multi-product orders | ✅ done (simplified 23 Oct 2026) |
| 3 | Daily production entries per shift | ✅ done (simplified 23 Oct 2026) |
| 4 | Technical service, mold changes, maintenance requests | ✅ done |
| 5 | QC inspections, holds/rejections, corrective actions | ✅ done |
| 6 | Warehouse stock ledger (in from production, out, adjustments) | ✅ done (simplified 23 Oct 2026) |
| 7 | Notifications, reports, CSV/PDF export, search | ✅ done |
| 8 | Full end-to-end tests, deployment, backups, operations guide | ✅ done |

## Run locally

Requires Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # set DATABASE_URL and DATABASE_URL_UNPOOLED
npm run db:deploy              # apply migrations
ADMIN_USERNAME=admin npm run db:seed   # prints a one-time temporary admin password
npm run dev                    # http://localhost:3000
```

Optional demo accounts (one per department, password `Demo12345!`):
`npm run demo:add` — remove them before going live with `npm run demo:remove`.

## Security model (summary)

- Passwords hashed with bcrypt (cost 12); temporary passwords must be changed at first sign-in.
- 5 failed sign-ins lock the account for 15 minutes.
- Session token in an httpOnly cookie; only its SHA-256 hash is stored. Disabling an employee ends all their sessions immediately.
- Every server action checks a `resource:action` permission on the server. Hiding a button is never the only protection.
- All active employees can view business records; creating, editing, approving and exporting depend on role permissions.
- Sensitive actions are written to the audit log (who, what, before/after, reason).
- The service worker caches only static files and an offline page — never factory data or signed-in pages.

Details and test results: [docs/SECURITY.md](docs/SECURITY.md).

## Documentation

| Guide | For |
|---|---|
| [USER-GUIDE.md](docs/USER-GUIDE.md) | Employees — quick guide per department |
| [OPERATIONS.md](docs/OPERATIONS.md) | Administrator — employees, staff leaving, go-live reset, monitoring, troubleshooting |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting choice and costs, environments, environment variables, migrations, first admin, updates |
| [BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md) | Automated backups and step-by-step restore |
| [SECURITY.md](docs/SECURITY.md) | Security controls and test results |
| [TESTING.md](docs/TESTING.md) | Test suites and how to run them |
