"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; data?: unknown };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/**
 * Submits a form to a server action WITHOUT React's automatic form reset,
 * so employees never lose what they typed when validation fails on the server.
 *
 * `once: true` (stock-changing forms) sends a one-time `submissionId` with the save. It stays the same
 * until the save succeeds (and while the form content is unchanged), so a retry after a lost connection is
 * recognised and not applied twice;
 * a second press while the first save is still running is ignored.
 */
export function useFormAction<R extends Result>(
  action: (prev: unknown, fd: FormData) => Promise<R>,
  opts: { onSuccess?: (res: R, form: HTMLFormElement) => void; resetOnSuccess?: boolean; once?: boolean } = {},
) {
  const t = useTranslations("common");
  const [state, setState] = useState<R | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const submission = useRef<{ id: string; content: string } | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (opts.once && busy.current) return;
    const form = e.currentTarget;
    // Include the clicked submit button's name/value (e.g. "Save draft" vs "Save & confirm").
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(form, submitter?.name ? submitter : undefined);
    if (opts.once) {
      // Same content again = a retry of the same submission; changed content = a new one.
      const content = JSON.stringify([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
      if (submission.current?.content !== content) submission.current = { id: newId(), content };
      fd.set("submissionId", submission.current.id);
      busy.current = true;
    }
    start(async () => {
      try {
        let res: R;
        try {
          res = await action(null, fd);
        } catch (err) {
          // Lost connection etc. Without `once` keep the old behaviour (the error page);
          // with `once` keep what was typed: pressing Save again is safe and won't save it twice.
          if (!opts.once) throw err;
          setState({ ok: false, error: t("connectionRetry") } as R);
          return;
        }
        setState(res);
        if (res.ok) {
          submission.current = null; // the next save is a new submission
          if (opts.resetOnSuccess) form.reset();
          opts.onSuccess?.(res, form);
        }
      } finally {
        busy.current = false;
      }
    });
  };
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};
  const error = state && !state.ok ? state.error : undefined;
  return { state, pending, onSubmit, fieldErrors, error };
}
