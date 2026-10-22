#!/usr/bin/env bash
# Recreates the empty acceptance database (local only).
# Stop the acceptance server first (it holds connections), run this, then start it again.
# Usage: bash tests/e2e/reset-accept-db.sh
set -euo pipefail
DB=${PGDB:-bereket_accept}
URL="postgresql://bereket:bereket_dev@localhost:5432/$DB"
su postgres -c "psql -q -c 'DROP DATABASE IF EXISTS $DB WITH (FORCE)' -c 'CREATE DATABASE $DB OWNER bereket'"
DATABASE_URL=$URL DATABASE_URL_UNPOOLED=$URL npx prisma migrate deploy >/dev/null
DATABASE_URL=$URL DATABASE_URL_UNPOOLED=$URL SEED_SKIP_ADMIN=1 npx tsx prisma/seed.ts >/dev/null
rm -rf .uploads/acceptance 2>/dev/null || true
echo "fresh database $DB ready"
