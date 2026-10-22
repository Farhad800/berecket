"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

/** Header search: a box on wide screens, an icon on phones. Press "/" to jump into it. */
export default function GlobalSearch() {
  const t = useTranslations("common");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || el.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <form action="/search" role="search" className="hidden max-w-md flex-1 md:block">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input
            ref={ref}
            name="q"
            minLength={2}
            required
            enterKeyHint="search"
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="min-h-10 w-full rounded-lg border border-line bg-surface-2 ps-9 pe-10 text-sm focus:bg-surface"
          />
          <kbd className="pointer-events-none absolute top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-muted end-2 lg:block">/</kbd>
        </label>
      </form>
      <Link href="/search" aria-label={t("search")} className="grid size-11 place-items-center rounded-lg hover:bg-surface-2 md:hidden">
        <Search className="size-5" />
      </Link>
    </>
  );
}
