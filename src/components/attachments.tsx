"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Camera, FileText, Paperclip } from "lucide-react";
import { uploadAttachmentsAction } from "@/app/actions/attachments";
import { Alert, Button } from "./ui";

export type AttachmentView = { id: string; filename: string; mimeType: string; when: string; by: string };

/** Shrinks phone photos to ≤1600px JPEG before upload — fast on factory Wi-Fi, still clear enough for defects. */
async function compress(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function Attachments({
  entityType,
  entityId,
  files,
  canAdd,
}: {
  entityType: string;
  entityId: string;
  files: AttachmentView[];
  canAdd: boolean;
}) {
  const t = useTranslations("files");
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    start(async () => {
      const fd = new FormData();
      fd.set("entityType", entityType);
      fd.set("entityId", entityId);
      for (const f of Array.from(list)) fd.append("files", await compress(f));
      const res = await uploadAttachmentsAction(fd);
      setError(res.ok ? null : res.error);
      if (input.current) input.current.value = "";
    });
  };

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {files.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f) => (
            <li key={f.id}>
              <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="group block overflow-hidden rounded-lg border border-line bg-surface-2" title={`${f.filename} · ${f.by} · ${f.when}`}>
                {f.mimeType.startsWith("image/") && f.mimeType !== "image/heic" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${f.id}`} alt={f.filename} loading="lazy" className="aspect-square w-full object-cover transition group-hover:opacity-90" />
                ) : (
                  <span className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted">
                    <FileText className="size-6" />
                    <span className="line-clamp-2 break-all">{f.filename}</span>
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => upload(e.target.files)}
            aria-label={t("add")}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" type="button" disabled={pending} onClick={() => input.current?.click()}>
              {pending ? <Paperclip className="size-4 animate-pulse" /> : <Camera className="size-4" />}
              {pending ? t("uploading") : t("add")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
