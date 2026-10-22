"use client";

import { useState, useTransition, type FormEvent } from "react";

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; data?: unknown };

/**
 * Submits a form to a server action WITHOUT React's automatic form reset,
 * so employees never lose what they typed when validation fails on the server.
 */
export function useFormAction<R extends Result>(
  action: (prev: unknown, fd: FormData) => Promise<R>,
  opts: { onSuccess?: (res: R, form: HTMLFormElement) => void; resetOnSuccess?: boolean } = {},
) {
  const [state, setState] = useState<R | null>(null);
  const [pending, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await action(null, fd);
      setState(res);
      if (res.ok) {
        if (opts.resetOnSuccess) form.reset();
        opts.onSuccess?.(res, form);
      }
    });
  };
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};
  const error = state && !state.ok ? state.error : undefined;
  return { state, pending, onSubmit, fieldErrors, error };
}
