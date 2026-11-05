import { cn } from "./ui";

/**
 * Charts.
 *
 * These are inline SVG rather than a charting library, for a reason worth
 * stating: they render on the server. A sparkline and a bar series are a
 * handful of coordinates, and shipping ~90 KB of Recharts to draw them would
 * make the dashboard slower for no gain. Recharts is loaded lazily, and only on
 * the analytics page where interaction actually earns it.
 *
 * Every chart here degrades to something readable with one data point, zero
 * data points, or all-equal values.
 */

/* ------------------------------------------------------------- sparkline */

export function Sparkline({
  points,
  stroke = "inflow",
  height = 64,
  width = 320,
  className,
  ariaLabel,
}: {
  points: number[];
  stroke?: "inflow" | "outflow" | "transfer" | "ink" | "brass";
  height?: number;
  width?: number;
  className?: string;
  ariaLabel?: string;
}) {
  if (points.length < 2) {
    return (
      <div
        className={cn("flex items-center text-xs text-ink-tertiary", className)}
        style={{ height }}
      >
        Not enough history yet.
      </div>
    );
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: i * step,
    y: height - ((p - min) / span) * (height - 8) - 4,
  }));

  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
    >
      <defs>
        <linearGradient id={`spark-${stroke}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`var(--color-${stroke})`} stopOpacity="0.14" />
          <stop offset="100%" stopColor={`var(--color-${stroke})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${stroke})`} />
      <path
        d={line}
        fill="none"
        stroke={`var(--color-${stroke})`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-line"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="2.5"
        fill={`var(--color-${stroke})`}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ bars */

export function BarSeries({
  data,
  color = "transfer",
  height = 120,
  className,
  ariaLabel,
}: {
  data: Array<{
    label: string;
    value: number;
    tone?: "inflow" | "outflow" | "transfer" | "warning" | "danger";
  }>;
  color?: string;
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-xs text-ink-tertiary">No data for this period.</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={className}>
      <div
        className="stagger flex items-end gap-[3px]"
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? "Bar chart"}
      >
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="min-h-[2px] flex-1 rounded-t-[2px] transition-opacity hover:opacity-80"
            style={
              {
                height: `${Math.max((d.value / max) * 100, 1.5)}%`,
                background: `var(--color-${d.tone ?? color})`,
                "--i": i,
              } as React.CSSProperties
            }
            title={`${d.label}: ${d.value.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="num flex justify-between pt-1.5 text-2xs text-ink-tertiary">
        <span>{data[0]?.label}</span>
        {data.length > 2 ? <span>{data[Math.floor(data.length / 2)]?.label}</span> : null}
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/**
 * In and out as opposing bars.
 *
 * The comparison people actually want from a cash-flow chart is "did more come
 * in than went out, and by how much" — which a single stacked bar cannot show.
 */
export function FlowBars({
  data,
  height = 160,
  className,
}: {
  data: Array<{ label: string; income: number; spending: number }>;
  height?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-xs text-ink-tertiary">No data for this period.</p>;
  }
  const max = Math.max(...data.flatMap((d) => [d.income, d.spending]), 1);

  return (
    <div className={className}>
      <div
        className="stagger grid items-end gap-2"
        style={{ height, gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label="Income and spending by month"
      >
        {data.map((d, i) => (
          <div
            key={d.label}
            className="flex h-full items-end gap-0.5"
            style={{ "--i": i } as React.CSSProperties}
          >
            <div
              className="min-h-[2px] flex-1 rounded-t-[2px] bg-inflow"
              style={{ height: `${(d.income / max) * 100}%` }}
              title={`${d.label} in: ${d.income.toLocaleString()}`}
            />
            <div
              className="min-h-[2px] flex-1 rounded-t-[2px] bg-outflow/85"
              style={{ height: `${(d.spending / max) * 100}%` }}
              title={`${d.label} out: ${d.spending.toLocaleString()}`}
            />
          </div>
        ))}
      </div>
      <div className="num flex justify-between pt-1.5 text-2xs text-ink-tertiary">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-[2px] bg-inflow" aria-hidden /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-[2px] bg-outflow" aria-hidden /> Spending
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- donut */

export function Donut({
  segments,
  size = 132,
  className,
  ariaLabel,
}: {
  segments: Array<{ label: string; value: number; colorIndex: number }>;
  size?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total <= 0) {
    return (
      <div
        className="grid place-items-center rounded-full border-[11px] border-sunken text-xs text-ink-tertiary"
        style={{ width: size, height: size }}
      >
        No spend
      </div>
    );
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  // Each arc's start depends on every arc before it, so the geometry is worked
  // out in full before any of it is rendered. Accumulating into a counter while
  // mapping to elements reads fine and is a real trap: the elements are
  // memoisable, the counter is not, so on a re-render that reuses some arcs the
  // rest are drawn from a stale offset and the ring comes apart.
  const arcs: Array<{ label: string; colorIndex: number; length: number; offset: number }> = [];
  let running = 0;
  for (const s of segments) {
    const length = (s.value / total) * circumference;
    arcs.push({ label: s.label, colorIndex: s.colorIndex, length, offset: running });
    running += length;
  }

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size }}
      className={cn("shrink-0 -rotate-90", className)}
      role="img"
      aria-label={ariaLabel ?? "Spending by category"}
    >
      {arcs.map((arc, i) => (
        <circle
          key={arc.label}
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={`var(--color-cat-${((arc.colorIndex - 1) % 12) + 1})`}
          strokeWidth="11"
          strokeDasharray={`${arc.length} ${circumference - arc.length}`}
          strokeDashoffset={-arc.offset}
          style={{ animation: `st-draw 640ms var(--ease-out-quint) ${i * 60}ms both` }}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------- calendar */

export function MiniCalendar({
  month,
  marks,
  today,
  hrefFor,
}: {
  /** First day of the month, UTC. */
  month: Date;
  /** Day-of-month → tones to show as dots. */
  marks: Record<number, Array<"inflow" | "outflow" | "transfer" | "warning">>;
  today?: number;
  hrefFor?: (day: number) => string;
}) {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-2xs text-ink-tertiary">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dots = marks[day] ?? [];
          const isToday = today === day;
          const content = (
            <>
              {day}
              <span className="flex h-1 gap-0.5">
                {dots.slice(0, 3).map((tone, j) => (
                  <i
                    key={j}
                    className="size-1 rounded-full"
                    style={{ background: `var(--color-${tone})` }}
                    aria-hidden
                  />
                ))}
              </span>
            </>
          );
          const className = cn(
            "num flex aspect-square flex-col items-center justify-center gap-0.5 rounded-sm border text-xs",
            isToday ? "border-brass bg-brass-wash" : "border-rule-faint bg-surface",
            dots.length > 0 && "font-medium",
          );

          return hrefFor ? (
            <a key={day} href={hrefFor(day)} className={className}>
              {content}
            </a>
          ) : (
            <div key={day} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
