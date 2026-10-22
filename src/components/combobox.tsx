"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "./ui";

export type ComboOption = { value: string; label: string; hint?: string; disabled?: boolean };

/**
 * Searchable dropdown that still submits like a normal form field (hidden input).
 * Type to filter by label or hint; arrow keys + Enter to pick. Works on touch screens.
 */
export default function Combobox({
  name,
  options,
  defaultValue,
  placeholder = "—",
  required,
  onChange,
  invalid,
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  onChange?: (value: string) => void;
  invalid?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (o: ComboOption) => {
    if (o.disabled) return;
    setValue(o.value);
    onChange?.(o.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />
      {/* Native required check via a visually-hidden mirror input */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="absolute inset-x-0 bottom-0 h-px opacity-0" />}
      <button
        type="button"
        id={name}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-start text-sm",
          invalid ? "border-red-500" : "border-line",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted")}>
          {selected ? selected.label : placeholder}
          {selected?.hint && <span className="ms-2 text-xs text-muted">{selected.hint}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-56 rounded-lg border border-line bg-surface shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="…"
            className="w-full border-b border-line bg-transparent px-3 py-2 text-sm focus:outline-none"
          />
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">—</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                  i === active && "bg-surface-2",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <Check className={cn("size-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
