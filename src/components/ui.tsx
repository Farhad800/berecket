import Link from "next/link";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...c: Parameters<typeof clsx>) => twMerge(clsx(c));

const buttonStyles = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-ink hover:bg-surface-2",
};

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof buttonStyles; size?: "sm" | "md" };

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed",
        size === "md" ? "min-h-11 px-4 text-sm" : "min-h-9 px-3 text-xs", // 44px tap targets for gloves/phones
        buttonStyles[variant],
        className,
      )}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return (
    <Link
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
        buttonStyles[variant],
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} className={cn("rounded-2xl border border-line bg-surface p-4 sm:p-5", className)} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={name} className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  "block w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input id={props.name} {...props} className={cn(inputCls, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea id={props.name} rows={3} {...props} className={cn(inputCls, "py-2", className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select id={props.name} {...props} className={cn(inputCls, className)} />;
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  blue: "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  purple: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};
export type Tone = keyof typeof badgeTones;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "amber" | "blue"; children: ReactNode }) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    blue: "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-900 dark:text-brand-100",
  };
  return <div role="status" className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone])}>{children}</div>;
}

/** The official logo, unmodified, on a tile matching its own background. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/bereket-logo.jpg"
      alt="Bereket Plastic"
      width={size}
      height={Math.round((size * 533) / 568)}
      className={cn("logo-tile rounded-xl object-contain", className)}
    />
  );
}
