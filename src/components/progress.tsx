import { cn } from "./ui";

/** Stacked bar: shipped (dark) ⊂ released/produced (mid) ⊂ planned (light), against the ordered quantity. */
export function StackedProgress({
  quantity,
  planned = 0,
  produced = 0,
  shipped = 0,
  className,
}: {
  quantity: number;
  planned?: number;
  produced?: number;
  shipped?: number;
  className?: string;
}) {
  const pct = (n: number) => `${Math.min(100, quantity > 0 ? (n / quantity) * 100 : 0)}%`;
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line", className)} aria-hidden>
      <div className="absolute inset-y-0 start-0 bg-brand-100 dark:bg-brand-800" style={{ width: pct(planned) }} />
      <div className="absolute inset-y-0 start-0 bg-brand-400" style={{ width: pct(produced) }} />
      <div className="absolute inset-y-0 start-0 bg-emerald-600" style={{ width: pct(shipped) }} />
    </div>
  );
}
