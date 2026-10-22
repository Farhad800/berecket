/**
 * Go-live tools from the command line (same logic as Administration → System).
 *
 *   npx tsx scripts/go-live.ts preview
 *   npx tsx scripts/go-live.ts reset-operations --yes     # test orders → shipments
 *   npx tsx scripts/go-live.ts reset-everything --yes     # also customers/products/machines/molds
 *   npx tsx scripts/go-live.ts remove-demo-users --yes
 *
 * Uses DATABASE_URL. Take a backup first (docs/BACKUP-RESTORE.md).
 */
import { PrismaClient } from "@prisma/client";
import { removeDemoUsers, resetData, resetPreview } from "../src/lib/data-reset";

const db = new PrismaClient();
const [cmd, flag] = process.argv.slice(2);

async function deleteBlobs(keys: string[]) {
  if (!keys.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  const { del } = await import("@vercel/blob");
  for (let i = 0; i < keys.length; i += 100) await del(keys.slice(i, i + 100)).catch(() => {});
}

async function main() {
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(`Database: ${host || "(DATABASE_URL not set)"}`);
  if (cmd === "preview" || !cmd) {
    console.log(JSON.stringify(await resetPreview(db), null, 2));
    return;
  }
  if (flag !== "--yes") {
    console.error("Add --yes to confirm. Nothing was changed.");
    process.exit(1);
  }
  if (cmd === "reset-operations" || cmd === "reset-everything") {
    const before = await resetPreview(db);
    const files = await resetData(db, cmd === "reset-everything" ? "everything" : "operations");
    await deleteBlobs(files);
    await db.auditLog.create({ data: { action: "system.reset", entityType: "System", reason: `${cmd} (command line)`, before, after: { filesDeleted: files.length } } });
    console.log("Done.", JSON.stringify(before.operations));
  } else if (cmd === "remove-demo-users") {
    const n = await removeDemoUsers(db);
    await db.auditLog.create({ data: { action: "system.remove_demo_users", entityType: "System", after: { removed: n } } });
    console.log(`Removed ${n} demo employees.`);
  } else {
    console.error(`Unknown command "${cmd}".`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
