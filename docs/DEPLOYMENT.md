# Deployment guide

Bereket Plastic Factory Management System (FMS) — how it is hosted, configured, set up and updated.

## 1. Where it runs and what it costs

| Part | Service | Why | Cost / limits that matter |
|---|---|---|---|
| Web app + server code | **Vercel** (region `fra1`, Frankfurt — closest low-latency region to Iraq) | Built for Next.js, zero server maintenance, automatic HTTPS, instant rollback | **Hobby (free) is for non-commercial use only.** A factory system is commercial use, so move the project to **Vercel Pro** (USD 20 per developer seat per month; viewers are free) before go-live. Pro also keeps runtime logs for 1 day instead of 1 hour. |
| Database | **Neon** PostgreSQL (Frankfurt), connected through the Vercel Marketplace | Managed PostgreSQL with point-in-time restore and branching | Free plan: restore window only **6 hours**. Recommended: **Launch** plan (usage-based; for this factory's size usually a few US dollars a month) and set the restore window to **7 days**. |
| Photos & PDFs | **Vercel Blob**, *private* store | Files have no public link; served only through the app after a permission check | Hobby includes 1 GB storage / 10 GB transfer per month, then Blob stops until the month resets. Pro is usage-based (about USD 0.023 per GB-month). Phones shrink photos to ≤ 1600 px before upload, so 1 GB holds roughly 5,000–10,000 photos. |
| Code | GitHub `Farhad800/berecket` | Source of truth; nightly backups run here (GitHub Actions) | Free. Make the repository **private**. |

Everything uses standard PostgreSQL and Node.js, so it can be moved to another host (a local server in the factory, another cloud) without changing the code — only the environment variables change.

## 2. Environments

| | Local development | Testing | Production |
|---|---|---|---|
| URL | http://localhost:3000 | http://localhost:3001 (acceptance) or a Vercel *Preview* URL | https://bereket-fms.vercel.app |
| Database | local PostgreSQL `bereket` | throw-away database `bereket_accept` (recreated for every run) | Neon `main` branch |
| Files | `./.uploads` folder | `./.uploads` | private Vercel Blob store |
| Demo accounts | allowed (`npm run demo:add`) | created by the tests | **never** — the scripts refuse unless `ALLOW_DEMO=1` |
| `NODE_ENV` | development | production build | production |

Preview deployments on Vercel are protected by Vercel login (Deployment Protection → *Standard*), so half-finished work is never public.

## 3. Environment variables

Set in Vercel → Project → Settings → Environment Variables (never in the code, never in the browser).

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** connection string (used by the app). Added automatically by the Neon integration. |
| `DATABASE_URL_UNPOOLED` | yes | Neon **direct** connection string (used for migrations and backups). Added by the Neon integration. |
| `BLOB_READ_WRITE_TOKEN` | yes (production) | Token of the private Blob store. Mark it **Sensitive**. Without it, files are stored on local disk (development only). |
| `FACTORY_TIMEZONE` | yes | `Asia/Baghdad`. Drives "today", shifts A/B/C and every displayed time. |
| `SETUP_TOKEN` | only for first setup | One-time code that allows creating the first administrator at `/setup`. Replace it with a long random value (or delete it) once the admin exists. |
| `ALLOW_DEMO` | no | Set to `1` only if you deliberately want demo scripts to run against production. Leave unset. |

`.env.example` lists the same variables for local development.

## 4. First deployment (already done for bereket-fms.vercel.app)

1. Import the GitHub repository into Vercel (framework: Next.js, region Frankfurt).
2. Vercel → Storage → add **Neon Postgres** (Frankfurt) and connect it to the project → `DATABASE_URL` and `DATABASE_URL_UNPOOLED` appear.
3. Vercel → Storage → create a **Blob** store, access **Private**, connect it → `BLOB_READ_WRITE_TOKEN` appears.
4. Add `FACTORY_TIMEZONE=Asia/Baghdad` and a temporary `SETUP_TOKEN`.
5. Build command is `npm run vercel-build`, which runs, in order:
   `make-icons` → `prisma generate` → **`prisma migrate deploy`** → **seed** (roles, departments, defect types, storage locations — idempotent) → `next build`.
6. Deploy. Check `https://<your-domain>/api/health` → `{"status":"ok"}`.

### Database migrations

- Schema changes are written as Prisma migrations in `prisma/migrations/` (`npm run db:migrate` locally).
- Every deployment applies pending migrations automatically (`prisma migrate deploy`) **before** the new code goes live; if a migration fails, the build fails and the old version keeps running.
- Never edit an applied migration; add a new one. Take a backup (or note the time for point-in-time restore) before deploying a migration that drops or rewrites data.

## 5. Initial administrator

1. With `SETUP_TOKEN` set and no administrator in the database, open `https://<domain>/setup`.
2. Enter the setup code, employee ID, name, username and a strong password (10+ characters with letters and numbers).
3. The page disappears for good once an administrator exists (`/setup` returns 404).
4. In Vercel, change `SETUP_TOKEN` to a long random value or remove it.

Alternative (command line, e.g. for a self-hosted server): `ADMIN_USERNAME=admin npm run db:seed` prints a one-time temporary password that must be changed at first sign-in.

## 6. Updating the application

1. Changes are committed to the `main` branch on GitHub.
2. A new production deployment is created from `main` (Vercel dashboard → *Deployments* → *Redeploy*, or connect the Git integration so every push deploys automatically).
3. Vercel builds it, applies migrations, and switches traffic only when the build succeeds — no downtime.
4. Verify `/api/health`, sign in, and open a couple of pages.
5. **If something is wrong:** Vercel → Deployments → previous deployment → **Instant Rollback**. If a migration changed data, also restore the database to the time before the deployment (see BACKUP-RESTORE.md).

Users get the new version on their next page load; the installed home-screen app updates itself (its service worker only caches static files).

## 7. Custom domain (optional)

Vercel → Project → Settings → Domains → add e.g. `fms.bereketplastic.com` and create the DNS record Vercel shows. HTTPS certificates are automatic.

## 8. Running on your own server instead (optional)

Requirements: Node.js 20+, PostgreSQL 14+, a reverse proxy with HTTPS (Caddy or Nginx).

```bash
npm ci
export DATABASE_URL=… DATABASE_URL_UNPOOLED=… FACTORY_TIMEZONE=Asia/Baghdad
npm run db:deploy && SEED_SKIP_ADMIN=1 npm run db:seed && npm run build
SETUP_TOKEN=<random> npm start     # then open /setup once
```

Without `BLOB_READ_WRITE_TOKEN`, files are stored in `./.uploads` — include that folder in your backups.

## Push notifications (Web Push)
Set on Vercel (Production + Preview): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (type *Sensitive* — server only), `VAPID_SUBJECT` (`mailto:` contact).
Generate a new pair with `npx web-push generate-vapid-keys`. Changing the keys means every device has to turn notifications on again
(the app re-registers devices automatically when permission is already granted).
