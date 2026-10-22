import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * File storage for photos and documents.
 * Production: PRIVATE Vercel Blob store — files have no public URL and are only
 * served through /api/files/[id] after a login + permission check.
 * Local development without a token: files go to ./.uploads (git-ignored).
 */
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export async function putFile(key: string, data: Buffer, contentType: string): Promise<string> {
  if (useBlob) {
    const { put } = await import("@vercel/blob");
    const res = await put(key, data, { access: "private", contentType, addRandomSuffix: true });
    return res.pathname;
  }
  const file = path.join(LOCAL_DIR, key);
  if (!file.startsWith(LOCAL_DIR)) throw new Error("Invalid storage key");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return key;
}

export async function getFile(storageKey: string): Promise<{ body: ReadableStream | Buffer; contentType?: string } | null> {
  if (useBlob) {
    const { get } = await import("@vercel/blob");
    const res = await get(storageKey, { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    return { body: res.stream, contentType: res.blob.contentType };
  }
  const file = path.join(LOCAL_DIR, storageKey);
  if (!file.startsWith(LOCAL_DIR)) return null;
  try {
    return { body: await readFile(file) };
  } catch {
    return null;
  }
}

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Permanently deletes stored files (used when test data is reset). Best effort. */
export async function deleteFiles(keys: string[]) {
  if (keys.length === 0) return;
  if (useBlob) {
    const { del } = await import("@vercel/blob");
    for (let i = 0; i < keys.length; i += 100) await del(keys.slice(i, i + 100)).catch(() => {});
    return;
  }
  const { rm } = await import("fs/promises");
  for (const k of keys) {
    const file = path.join(LOCAL_DIR, k);
    if (file.startsWith(LOCAL_DIR)) await rm(file, { force: true }).catch(() => {});
  }
}
