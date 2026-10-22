// Uploads a folder made by backup-files.mjs back into a private Vercel Blob store,
// under the same pathnames, so the database's attachment records work again.
//   BLOB_READ_WRITE_TOKEN=… node scripts/restore-files.mjs ./files-backup
import { put } from "@vercel/blob";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "files-backup");
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".pdf": "application/pdf" };
let n = 0;
for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const full = path.join(entry.parentPath ?? entry.path, entry.name);
  const pathname = path.relative(root, full).split(path.sep).join("/");
  await put(pathname, await readFile(full), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: types[path.extname(full).toLowerCase()] ?? "application/octet-stream",
  });
  n++;
}
console.log(`Restored ${n} files.`);
