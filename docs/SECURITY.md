# Security

## Controls in place

**Sign-in and sessions**
- Individual accounts only; passwords hashed with bcrypt (cost 12); minimum 10 characters with letters and numbers.
- Temporary passwords (new employee, reset) must be changed at first sign-in.
- 5 failed attempts lock the account for 15 minutes; the error message is the same for "unknown user" and "wrong password".
- Session = random 256-bit token in an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie; the database stores only its SHA-256 hash; 12-hour lifetime.
- Disabling an employee deletes all their sessions at once.
- The first administrator can only be created with a one-time setup code, and `/setup` disappears once an administrator exists.

**Authorisation**
- Permissions are `resource:action` pairs stored per role and checked **on the server** in every server action, API route and protected page. Hidden buttons are a convenience only.
- Every employee can read business records (global visibility rule); create/edit/approve/export/archive/manage depend on role.
- Exports (CSV/PDF) need `reports:export`; the audit log needs `audit:view` / `audit:export`; go-live tools need `settings:manage` **and** the administrator's password.

**Requests and data**
- Next.js server actions reject cross-site requests (Origin must match the host) — CSRF protection.
- All database access goes through Prisma with bound parameters; raw SQL uses tagged templates (parameterised). Report filters are validated against allow-lists.
- React escapes all text; user comments are shown as text, never HTML.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@` at the start of a cell).
- Uploads: type checked from the file's bytes (JPG/PNG/WEBP/HEIC/PDF only), 8 MB limit, stored in a private Blob store, served only after a permission check with `nosniff` and a sandboxing Content-Security-Policy.
- Important operations run in database transactions (daily production + stock in, stock out, QC rejects, corrections) with row locks on the product so stock can never go below zero.
- Audit log of sensitive actions with before/after values; no one can edit or delete it.

**Transport and headers**
- HTTPS only (HSTS 2 years), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, no `X-Powered-By`.
- Secrets (database URLs, Blob token) exist only as server environment variables — never in browser code or the repository.
- The offline service worker caches only static assets and the offline page, never signed-in pages or factory data.

## Test results (22 Oct 2026)

`tests/e2e/security.py` — **28/28 passed**:
signed-out access to pages and APIs refused; forged session cookie refused; security headers present; setup page closed; no user enumeration; lockout after 5 failures; only token hashes and bcrypt hashes stored; cookie HttpOnly/SameSite and unreadable from JavaScript; a Production user replaying a captured *administrator* server action is refused by the server; the same request with a foreign Origin is rejected (CSRF), while the genuine request works (control); disabled employee signed out immediately and can't sign in; SQL-like input in search and filters is harmless; HTML/script in a comment is shown as text; an HTML file renamed `.pdf` is rejected; unknown file ids give 404; another employee's notification can't be opened; security events are in the audit log.

The acceptance test (`tests/e2e/acceptance.py`) repeats the backend-rejection checks from an empty database.

`npm audit --omit=dev`: **0 known vulnerabilities** (patched `postcss` and `deepmerge-ts` are pinned through `overrides` in package.json).

## Known limits / recommendations

- Lockout is per account. A slow guessing attack spread over many accounts isn't rate-limited per IP; Vercel's DDoS protection and the Vercel Firewall (rate-limit rule on `/login`) can add that.
- Two-factor sign-in is not built in. Use strong passwords; consider 2FA for administrators in a later version.
- Keep the GitHub repository **private** and mark `BLOB_READ_WRITE_TOKEN` as *Sensitive* in Vercel.
- Review dependency updates monthly (`npm audit`); plan the move to Next.js 16 / Prisma 7 when convenient.
