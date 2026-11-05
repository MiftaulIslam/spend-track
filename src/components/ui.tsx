import { type VariantProps, cva } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

/**
 * Core UI primitives.
 *
 * These are Server-Component-safe — no hooks, no "use client". Anything that
 * needs interactivity lives in its own client component file, so a page that
 * only renders a panel and some rows ships no JavaScript for them.
 */

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/* ------------------------------------------------------------------ text */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-md font-semibold sm:text-lg">{children}</h1>
      {sub ? <p className="truncate text-xs text-ink-tertiary">{sub}</p> : null}
    </div>
  );
}

export function SectionHead({
  title,
  meta,
  action,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="ml-auto flex items-baseline gap-3 text-xs text-ink-tertiary">
        {meta}
        {action}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

/** A hairline-bounded region, not a floating card. */
export function Panel({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-clip border border-rule bg-surface",
        flush ? "-mx-4 border-x-0 sm:mx-0 sm:rounded-lg sm:border-x" : "rounded-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHead({
  title,
  action,
  icon,
}: {
  title: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
      {icon}
      <h3 className="text-sm font-semibold">{title}</h3>
      {action ? <div className="ml-auto text-xs font-medium text-ink-secondary">{action}</div> : null}
    </div>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}

export function PanelFoot({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-rule px-4 py-3", className)}>{children}</div>;
}

/* ---------------------------------------------------------------- button */

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-medium " +
    "transition-[background-color,border-color,transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] " +
    "active:scale-[0.975] disabled:pointer-events-none disabled:opacity-45 " +
    "[-webkit-tap-highlight-color:transparent]",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ink-inverse hover:bg-ink/88",
        secondary: "border-rule-strong bg-surface text-ink hover:bg-sunken",
        ghost: "text-ink-secondary hover:bg-rule-faint hover:text-ink",
        brass: "bg-brass text-white hover:bg-brass-deep",
        danger: "bg-danger text-white hover:opacity-90",
        outlineDanger: "border-danger/30 text-danger hover:bg-danger-wash",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-md",
        icon: "size-9 p-0",
        iconSm: "size-8 p-0",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "secondary", size: "md", block: false },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, block, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size, block }), className)} {...props} />;
}

export type LinkButtonProps = ComponentProps<"a"> & VariantProps<typeof buttonStyles>;

export function LinkButton({ className, variant, size, block, ...props }: LinkButtonProps) {
  return <a className={cn(buttonStyles({ variant, size, block }), className)} {...props} />;
}

/* ------------------------------------------------------------ chip/badge */

export function Chip({
  children,
  selected = false,
  className,
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium",
        "transition-colors duration-150",
        selected
          ? "border-ink bg-ink text-ink-inverse"
          : "border-rule bg-surface text-ink-secondary hover:border-rule-strong hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const badgeStyles = cva(
  "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-wash text-ink-secondary",
        inflow: "bg-inflow-wash text-inflow",
        outflow: "bg-outflow-wash text-outflow",
        transfer: "bg-transfer-wash text-transfer",
        warning: "bg-warning-wash text-warning",
        danger: "bg-danger-wash text-danger",
        info: "bg-info-wash text-info",
        brass: "bg-brass-wash text-brass-deep",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  children,
  tone,
  className,
}: { children: ReactNode; className?: string } & VariantProps<typeof badgeStyles>) {
  return <span className={cn(badgeStyles({ tone }), className)}>{children}</span>;
}

/** Category colour dot. The index maps to --color-cat-N. */
export function Dot({ index = 12, className }: { index?: number; className?: string }) {
  return (
    <span
      className={cn("size-[7px] shrink-0 rounded-full", className)}
      style={{ background: `var(--color-cat-${((index - 1) % 12) + 1})` }}
    />
  );
}

/* ----------------------------------------------------------------- meter */

export type MeterTone = "ok" | "warn" | "over";

/**
 * A budget bar with a **pace marker** — the tick showing how far through the
 * period you are. Without it, "85% used" says nothing: on day 5 it is alarming,
 * on day 28 it is fine.
 */
export function Meter({
  value,
  tone = "ok",
  mark,
  className,
  label,
}: {
  /** 0–1 (or more, when over). */
  value: number;
  tone?: MeterTone;
  /** 0–1 position of the pace marker. */
  mark?: number | null;
  className?: string;
  label?: string;
}) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  const fill =
    tone === "over" ? "bg-danger" : tone === "warn" ? "bg-warning" : "bg-inflow";

  return (
    <div
      className={cn("relative h-1.5 overflow-hidden rounded-full bg-sunken", className)}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("animate-meter h-full rounded-full", fill)}
        style={{ width: `${pct}%` }}
      />
      {mark != null ? (
        <span
          className="absolute -top-0.5 -bottom-0.5 w-px bg-ink/45"
          style={{ left: `${Math.min(Math.max(mark, 0), 1) * 100}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- states */

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="grid size-16 place-items-center rounded-lg border border-rule bg-surface text-ink-tertiary [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <p className="text-md font-semibold">{title}</p>
      <p className="max-w-[34ch] text-sm leading-relaxed text-ink-tertiary">{body}</p>
      {action ? <div className="mt-1 flex gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xs", className)} aria-hidden />;
}

/** Skeleton shaped like the transaction list, so nothing shifts on load. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
          <Skeleton className="size-[34px] rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

const calloutStyles = cva("flex gap-2.5 rounded-md border p-3 text-sm leading-snug [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    tone: {
      info: "border-info/25 bg-info-wash text-info",
      warning: "border-warning/25 bg-warning-wash text-warning",
      danger: "border-danger/25 bg-danger-wash text-danger",
      brass: "border-brass/30 bg-brass-wash text-brass-deep",
      inflow: "border-inflow/25 bg-inflow-wash text-inflow",
    },
  },
  defaultVariants: { tone: "info" },
});

export function Callout({
  icon,
  children,
  tone,
  className,
}: { icon?: ReactNode; children: ReactNode; className?: string } & VariantProps<typeof calloutStyles>) {
  return (
    <div className={cn(calloutStyles({ tone }), className)} role="status">
      {icon}
      <div className="min-w-0 [&_a]:underline [&_a]:underline-offset-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ stat */

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-clip rounded-lg border border-rule bg-rule",
        "grid-cols-2",
        cols === 3 && "md:grid-cols-3",
        cols === 4 && "md:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface p-4">
      <span className="eyebrow">{label}</span>
      <span className="num text-lg font-medium tracking-[-0.025em]">{value}</span>
      {delta ? (
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            tone === "up" ? "text-inflow" : tone === "down" ? "text-outflow" : "text-ink-tertiary",
          )}
        >
          {delta}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- fields */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label ? <span className="text-xs font-semibold text-ink-secondary">{label}</span> : null}
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink-tertiary">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-md border border-rule-strong bg-surface px-3 text-base text-ink " +
  "transition-colors duration-150 placeholder:text-ink-disabled " +
  "hover:border-rule-strong/70 aria-invalid:border-danger aria-invalid:bg-danger-wash";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, props.type === "number" && "num", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(inputClass, "h-auto min-h-[84px] resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        inputClass,
        "appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2393908A%22 stroke-width=%222.5%22><path d=%22M6 9l6 6 6-6%22/></svg>')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num rounded-xs border border-rule border-b-2 bg-sunken px-1.5 py-0.5 text-[10px] text-ink-tertiary">
      {children}
    </kbd>
  );
}

/* ----------------------------------------------------------------- table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, numeric, className }: { children?: ReactNode; numeric?: boolean; className?: string }) {
  return (
    <th
      className={cn(
        "eyebrow whitespace-nowrap border-b border-rule bg-surface px-3 py-2 text-left",
        numeric && "text-right",
        className,
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function Td({ children, numeric, className }: { children?: ReactNode; numeric?: boolean; className?: string }) {
  return (
    <td
      className={cn(
        "border-b border-rule-faint px-3 py-2.5 align-middle",
        numeric && "num text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}
