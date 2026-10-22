# Bereket Plastic — Factory Management System

Web application connecting Sales & Planning, Production, Technical Service, Quality Control and Warehouse.
Works in any browser on PC, tablet and phone, and can be installed to the home screen.

**Stack:** Next.js 15 (TypeScript) · Tailwind CSS · PostgreSQL · Prisma · server-side sessions · Vercel hosting.
**Languages:** English, Arabic (right-to-left), Turkish. Arabic and Turkish texts are machine-drafted and need review by a native speaker before go-live.

## Build status

| Stage | Scope | Status |
|---|---|---|
| 1 | Login, roles & permissions, employees, dashboard, branding, languages, install-to-home-screen | ✅ done |
| 2 | Customers, products, machines & molds, multi-line orders, production calendar | next |
| 3 | Production jobs, batches, quantities, downtime | |
| 4 | Technical service, mold changes, maintenance requests | |
| 5 | QC inspections, holds/rejections, corrective actions | |
| 6 | Warehouse receipts, stock ledger, shipments | |
| 7 | Notifications, reports, CSV/PDF export, search | |
| 8 | Full end-to-end tests, deployment, backups, operations guide | |

## Run locally

Requires Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # set DATABASE_URL and DIRECT_URL
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

Full deployment, backup and restore guides arrive in Stage 8.
