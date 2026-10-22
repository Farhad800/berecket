// Downloads every stored photo/PDF from the private Vercel Blob store into a folder,
// keeping each file's exact pathname (the database refers to files by pathname).
//   BLOB_READ_WRITE_TOKEN=… node scripts/backup-files.mjs ./files-backup
import { list, get } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "files-backup");
let cursor, count = 0, bytes = 0;
do {
  const page = await list({ cursor, limit: 1000 });
  for (const b of page.blobs) {
    const res = await get(b.pathname, { access: "private" });
    if (!res || res.statusCode !== 200) { console.error("skipped", b.pathname); continue; }
    const file = path.join(out, b.pathname);
    if (!file.startsWith(out)) continue;
    await mkdir(path.dirname(file), { recursive: true });
    const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
    await writeFile(file, buf);
    count++; bytes += buf.length;
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`Backed up ${count} files (${(bytes / 1048576).toFixed(1)} MB) to ${out}`);
