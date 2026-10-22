"use client";

import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { addCommentAction } from "@/app/actions/orders";
import { useFormAction } from "./use-form-action";
import { Alert, Button, Textarea } from "./ui";

export type CommentView = { id: string; author: string; when: string; body: string };

/** Discussion thread attached to a record. Anyone who can see the record can add to it. */
export default function Comments({ entityType, entityId, comments }: { entityType: string; entityId: string; comments: CommentView[] }) {
  const t = useTranslations("comments");
  const { onSubmit, pending, error } = useFormAction(addCommentAction, { resetOnSuccess: true });
  return (
    <div>
      {comments.length === 0 ? (
        <p className="mb-3 text-sm text-muted">{t("none")}</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted"><b className="text-ink">{c.author}</b> · {c.when}</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        {error && <Alert>{error}</Alert>}
        <Textarea name="body" rows={2} placeholder={t("placeholder")} required aria-label={t("placeholder")} />
        <Button size="sm" type="submit" disabled={pending}><Send className="size-3.5" /> {t("add")}</Button>
      </form>
    </div>
  );
}
