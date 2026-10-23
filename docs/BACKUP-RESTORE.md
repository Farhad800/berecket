# Backups and restore

Two independent layers protect the factory's data. Either one alone is enough to recover.

| Layer | What it covers | How far back | Where it lives |
|---|---|---|---|
| **1. Neon point-in-time restore** | The whole database, to any second | 6 h on the Free plan, **7 days on Launch (recommended)**, 30 days on Scale | Inside Neon |
| **2. Nightly encrypted backups** | Database dump + all photos/PDFs | 30 days of nightly copies | GitHub Actions artifacts (encrypted with your passphrase) |

Rehearsed: a full dump → encrypt → decrypt → restore into an empty database was tested on 22 Oct 2026 and every table came back with identical row counts.

## Automated backup configuration

### Layer 1 — Neon (switch on once)

1. Neon console → your project → **Settings → Postgres → History window**.
2. On the Launch plan set it to **7 days**. (On Free it is fixed at 6 hours.)

Nothing else is needed: Neon keeps the change history continuously.

### Layer 2 — nightly encrypted backups (GitHub Actions)

The workflow `.github/workflows/backup.yml` runs every night at 03:30 Duhok time and can also be started by hand. It:

1. dumps the database with `pg_dump --format=custom`,
2. downloads every stored file from the private Blob store,
3. encrypts both with AES-256 using your passphrase,
4. keeps them for 30 days as downloadable artifacts of the run.

**One-time setup** — GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|---|---|
| `DATABASE_URL_UNPOOLED` | Neon *direct* connection string (Vercel → Settings → Environment Variables, or Neon console → Connect, "Pooled connection" **off**) |
| `BLOB_READ_WRITE_TOKEN` | the same value as in Vercel |
| `BACKUP_PASSPHRASE` | a long random sentence. **Write it down and keep it somewhere safe outside GitHub** (e.g. a sealed envelope in the office safe). Without it the backups can't be opened. |

Then GitHub → **Actions → Nightly backup → Run workflow** once and check that both jobs turn green.

**Check weekly:** Actions → Nightly backup shows a green tick for each night. GitHub emails the repository owner when a scheduled run fails.

> If the repository is public, the encrypted artifacts can be downloaded by anyone, but they can't be read without the passphrase. Making the repository private is still recommended.

## Restore procedures

Always decide first **to which moment** you want to go back, and tell staff to stop entering data until the restore is finished. Every restore and its reason should be written in the operations log.

### A. Restore the database to a moment in the last days (Neon instant restore) — fastest

Use when: wrong data was entered or deleted, a bad update, a mistaken "clear test data".

1. Neon console → project → **Backup & Restore** → **Restore from history**.
2. Branch to restore: `main` (production). Tab **From history**.
3. Pick the date and time just **before** the problem (times are UTC: Duhok time minus 3 hours).
4. **Next** → review → **Restore**.
5. Neon replaces the data and automatically keeps the previous state as a branch called `main_old_<timestamp>`, so the restore itself can be undone the same way.
6. The connection string doesn't change; the app reconnects by itself. Check `/api/health`, sign in, open the order you were worried about.

Note: photos/PDFs are not part of the database timeline. Files uploaded after the chosen moment stay in storage (harmless); files are never deleted by a database restore.

### B. Restore from a nightly backup (e.g. the Neon project was lost)

You need: the backup artifact (`database-YYYY-MM-DD` and `files-YYYY-MM-DD` from the GitHub Actions run), the passphrase, and a computer with PostgreSQL 17 client tools and Node.js 20+.

```bash
# 1. Decrypt
gpg --decrypt --output bereket-db.dump bereket-db-YYYY-MM-DD.dump.gpg
gpg --decrypt --output files.tar.gz bereket-files-YYYY-MM-DD.tar.gz.gpg

# 2. Create a new empty database (new Neon project/branch, or any PostgreSQL 14+)
#    and copy its DIRECT connection string into TARGET_URL.

# 3. Restore the data
pg_restore --no-owner --no-acl --dbname="$TARGET_URL" bereket-db.dump
#   (restoring over an existing database instead: add --clean --if-exists)

# 4. Check it
psql "$TARGET_URL" -c 'SELECT count(*) FROM "Order";' -c 'SELECT max("createdAt") FROM "AuditLog";'

# 5. Restore the files into the (new) private Blob store, keeping their names
tar -xzf files.tar.gz
BLOB_READ_WRITE_TOKEN=<token of the store> node scripts/restore-files.mjs files-backup
```

6. In Vercel, point `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (and `BLOB_READ_WRITE_TOKEN` if the store changed) to the restored database, then **Redeploy**. Migrations run automatically; they are already applied, so nothing changes.
7. Sign in and verify a few recent orders, a maintenance request with photos, and the audit log.

### C. Copy a backup to look at old data without touching production

Do procedure B into a *separate* Neon branch or a local PostgreSQL and run the app locally against it (`DATABASE_URL=… npm run dev`). Production is untouched.

## Restore drill (every 3 months)

1. Download last night's `database-…` artifact.
2. Do procedure B, steps 1–4, into a throw-away database.
3. Compare `SELECT count(*) FROM "Order"` with production. Record the date and result in the operations log, then delete the throw-away database.

## Local / self-hosted installations

Run the same commands from cron, e.g. nightly:

```bash
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL_UNPOOLED" --file="/backups/bereket-$(date +%F).dump"
tar -czf "/backups/uploads-$(date +%F).tar.gz" .uploads
find /backups -mtime +30 -delete
```

and copy `/backups` to a second location (another machine or cloud storage).
