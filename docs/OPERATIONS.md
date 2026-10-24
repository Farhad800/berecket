# Operations guide (for the system administrator)

Day-to-day running of the Bereket Plastic FMS. No programming needed for anything in sections 1–6.

## Replacing the whole item list
Administration → System → **Replace the item list** removes every product, sticker and material (machines, molds, employees and the audit log stay). Type `DELETE ITEMS` and your password. It is refused while any item is used by orders, production or stock — clear the test transactions first. Then import the corrected Excel file (Products → Import from Excel).

## 1. Daily and weekly checks

| When | Check | Where |
|---|---|---|
| Daily | The site opens and you can sign in | https://bereket-fms.vercel.app |
| Daily | Dashboard numbers look sensible (orders, production today, machines down) | Dashboard |
| Weekly | Last night's backup is green | GitHub → Actions → *Nightly backup* |
| Weekly | No unexpected errors | Vercel → Project → **Logs**, filter `"level":"error"` |
| Monthly | Unused or departed employees are disabled | Administration → Employees |
| Every 3 months | Restore drill | docs/BACKUP-RESTORE.md |

**Uptime alert (recommended, free):** create a monitor at a free uptime service (e.g. UptimeRobot) for `https://bereket-fms.vercel.app/api/health`, checking every 5 minutes, alerting by email/SMS. The address answers `{"status":"ok"}` only when the app **and** the database are working.

## 2. Employees

- **Add:** Administration → Employees → *New employee*. Choose the role and department. A **temporary password** is shown **once** — give it to the employee privately. At first sign-in they must choose their own password.
- **Forgotten password:** *Reset password* on the employee's card → a new temporary password is shown once.
- **Locked out:** after 5 wrong passwords the account locks for 15 minutes, then works again by itself. (Or reset the password.)
- **Change role/department:** *Edit*. Takes effect on their next page.
- **Roles & permissions:** Administration → Roles & permissions. Every department can always *see* all records; the matrix controls creating, editing, approving, exporting and archiving. You can create new roles (e.g. "Shift supervisor"). Built-in roles can be adjusted but not deleted.

### When someone leaves the company

1. Administration → Employees → their card → **Disable**. They are signed out on every device **immediately** and can't sign in again.
2. Do **not** delete the person — their name stays on the orders, reports and decisions they made (this is your audit trail).
3. Reassign anything still open in their name: open maintenance requests (Technical Service), open quality issues (Quality Control).
4. If they knew the administrator password or the backup passphrase, change those.
5. If they had access to Vercel, Neon or GitHub, remove them there too.

## 2b. Deleting versus archiving

- **Delete** (products, machines, molds, orders) removes a record that was created by mistake and **never used**. Machines and molds need the *Assets: archive* permission, orders *Orders: archive*; deleting an order also needs a reason. Every delete is written to the audit log with what was deleted.
- As soon as a record has history (an order with production, a machine with jobs or repairs…), the system refuses to delete it and says why. Use **Archive** instead (master data) or **Cancel** (orders): the record disappears from everyday lists and pickers but past orders, reports and traceability stay correct.

## 3. Starting real use (go-live)

When testing is finished:

1. Make sure a backup exists (Actions → Nightly backup → *Run workflow*, wait for green).
2. Administration → **System**:
   - **Demo employee accounts** → *Remove demo accounts* (accounts starting with `demo.`).
   - **Clear test data before going live** → choose *Test transactions only* (keeps products, machines, molds) or *Everything*. Type `RESET`, enter your password, confirm.
3. What is never deleted: employees, roles, departments, defect types, storage locations, the audit log. Numbering (ORD-, JOB-, LOT-…) starts again from 0001.
4. Check machine statuses and mold positions (Machines & Molds) match the shop floor.

This action is recorded in the audit log. Developers can do the same from the command line: `npx tsx scripts/go-live.ts preview | reset-operations --yes | reset-everything --yes | remove-demo-users --yes`.

### Demonstration data (training / testing environments only)

`npm run demo:add` creates one demo employee per department (password `Demo12345!`) plus demo products, Toyo machines and molds whose codes start with `DEMO-`. `npm run demo:remove` deletes them again. Both refuse to run against production unless `ALLOW_DEMO=1` is set.

## 4. Audit log

Insights → **Audit log** (permission *Audit: view*). Shows who did what and when, with old → new values and reasons: logins, employee and role changes, order changes, completions and deletions, daily production entries and corrections, maintenance steps, every QC decision, stock out and adjustments, report exports, go-live resets. Filter by time, person and record type; *Excel (CSV)* exports it (permission *Audit: export*). Entries can't be edited or deleted by anyone.

## 5. Photos and documents (attachments)

- Only JPG, PNG, WEBP, HEIC photos and PDFs up to 8 MB; the server checks the real file content, not just the name. Phones shrink photos before upload.
- Files are stored in a **private** store: there are no public links. Every view goes through the app, which checks that the person is signed in and may see that record.
- Files are included in the nightly backup.

## 6. Language and time zone

- Each employee picks English, Arabic or Turkish (globe icon). Arabic switches to right-to-left.
- All times are shown in the factory time zone (`FACTORY_TIMEZONE`, Asia/Baghdad). Shifts: A 07–15, B 15–23, C 23–07.
- The Arabic and Turkish wording was machine-drafted; have a native speaker review it. Texts live in `messages/ar.json` and `messages/tr.json`.

## 7. Errors and monitoring (technical)

- When a page fails, the employee sees a friendly page with a short **ref** code. Every server error is logged as one JSON line with the same code (`digest`) — search for it in Vercel → Logs to find the cause.
- Vercel keeps runtime logs for 1 hour (Hobby) / 1 day (Pro). For longer retention, Pro can forward logs with a *Log Drain*.
- `/api/health` checks the database; use it for uptime monitoring.
- Vercel → Observability shows response times and function errors.

## 8. Updating, rolling back

See DEPLOYMENT.md §6. In short: deploy from `main`; if anything is wrong, Vercel → Deployments → previous one → **Instant Rollback**.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Everyone sees "This page couldn't load" | Database unreachable or out of quota | Check `/api/health`; Neon console → project status/usage |
| Photos don't upload / show | Blob quota reached (Hobby) or token missing | Vercel → Storage → Blob usage; check `BLOB_READ_WRITE_TOKEN` |
| One employee can't sign in | Locked (5 wrong tries) or disabled | Wait 15 min or reset password; check *Active* |
| Someone can't press a button they need | Role lacks that permission | Administration → Roles & permissions |
| Times look 3 hours off | `FACTORY_TIMEZONE` missing | Set it to `Asia/Baghdad` and redeploy |
| Install-to-home-screen banner doesn't appear | Already installed, or dismissed on that device | Browser menu → *Add to Home Screen* |
