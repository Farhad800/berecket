"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { cn } from "./ui";

export type FilterDef = { name: string; label: string; options: { value: string; label: string }[] };

/** Search box + filter dropdowns bound to the URL, so filtered lists can be shared and bookmarked. */
export default function ListToolbar({ filters = [], placeholder }: { filters?: FilterDef[]; placeholder?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const push = (next: URLSearchParams) => start(() => router.replace(`${path}?${next.toString()}`));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    push(next);
  };

  // Debounced search-as-you-type
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const id = setTimeout(() => set("q", q.trim()), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn("mb-4 flex flex-wrap gap-2", pending && "opacity-70")}>
      <label className="relative min-w-52 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? t("search")}
          aria-label={t("search")}
          className="min-h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-sm"
        />
      </label>
      {filters.map((f) => (
        <select
          key={f.name}
          aria-label={f.label}
          value={params.get(f.name) ?? ""}
          onChange={(e) => set(f.name, e.target.value)}
          className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm"
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </div>
  );
}
