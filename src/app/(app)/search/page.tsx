import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Search } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { globalSearch } from "@/lib/search";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  const me = await pageUser();
  const t = await getTranslations();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const groups = await globalSearch(q, me);

  // Typing an exact record number (e.g. ORD-2026-0007 or a lot number) jumps straight to it.
  const exact = groups.flatMap((g) => g.hits.filter((h) => h.exact));
  if (exact.length === 1 && !sp.all) redirect(exact[0].href);

  const total = groups.reduce((s, g) => s + g.hits.length, 0);
  return (
    <>
      <PageHeader title={t("search.title")} subtitle={t("search.hint")} />
      <form action="/search" className="mb-5">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 text-muted start-3" />
          <input
            name="q"
            defaultValue={q}
            autoFocus={!q}
            enterKeyHint="search"
            minLength={2}
            placeholder={t("common.searchPlaceholder")}
            aria-label={t("search.title")}
            className="min-h-12 w-full rounded-xl border border-line bg-surface ps-11 pe-3 text-base"
          />
        </label>
      </form>
      {q.length < 2 ? (
        <EmptyState>{t("search.typeMore")}</EmptyState>
      ) : total === 0 ? (
        <EmptyState>{t("search.none", { q })}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.kind} className="p-0 sm:p-0">
              <h2 className="border-b border-line px-4 py-2.5 text-sm font-bold">
                {t(`search.kind.${g.kind}`)} <span className="font-normal text-muted">({g.hits.length}{g.hits.length >= 8 ? "+" : ""})</span>
              </h2>
              <ul className="divide-y divide-line">
                {g.hits.map((h) => (
                  <li key={h.href + h.title}>
                    <Link href={h.href} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block font-semibold" dir="auto">{h.title}</span>
                        {h.sub && <span className="block truncate text-xs text-muted" dir="auto">{h.sub}</span>}
                      </span>
                      {h.status && <Badge tone={h.status.tone}>{t(`${h.status.ns}.${h.status.value}`)}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
