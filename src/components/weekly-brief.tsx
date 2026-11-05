import Link from "next/link";
import { formatInstant } from "@/src/domain/datetime";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/src/server/db";
import { notifications } from "@/src/server/db/schema";
import { requireUserPage } from "@/src/server/auth/guards";
import { aiConfigured } from "@/src/server/ai/client";
import { Panel, PanelBody, PanelHead } from "./ui";
import { IconSparkle } from "./icons";

/**
 * The AI brief on the dashboard.
 *
 * Reads the most recent brief rather than generating one on page load — a
 * dashboard that waits three seconds for a language model is a worse dashboard.
 * The weekly-brief job writes it; this renders it. When there is no brief and
 * no API key, the panel is simply absent rather than an error or a placeholder.
 */

const ACTION_HREF: Record<string, string> = {
  review_budget: "/budgets",
  review_subscriptions: "/subscriptions",
  review_transaction: "/transactions?needsReview=true",
  set_budget: "/budgets/new",
  contribute_goal: "/goals",
};

export async function WeeklyBrief() {
  const actor = await requireUserPage();

  const notification = await db.query.notifications.findFirst({
    where: and(eq(notifications.userId, actor.userId), eq(notifications.kind, "WEEKLY_BRIEF")),
    orderBy: [desc(notifications.createdAt)],
    columns: { title: true, body: true, data: true, createdAt: true },
  });

  if (!notification) {
    if (!aiConfigured()) return null;
    return (
      <section className="mt-6">
        <Panel className="border-brass/30">
          <PanelHead
            title="Weekly brief"
            icon={
              <span className="grid size-[26px] place-items-center rounded-md bg-brass-wash text-brass-deep">
                <IconSparkle size={15} />
              </span>
            }
          />
          <PanelBody>
            <p className="text-sm leading-relaxed text-ink-secondary">
              Your first brief is generated on Monday morning. It reads the week&rsquo;s figures —
              all computed here, not estimated — and tells you the one or two things worth acting
              on.
            </p>
            <Link
              href="/assistant"
              className="mt-3 inline-flex h-8 items-center rounded-md border border-rule-strong bg-surface px-3 text-sm font-medium"
            >
              Ask the assistant instead
            </Link>
          </PanelBody>
        </Panel>
      </section>
    );
  }

  const data = (notification.data ?? {}) as {
    suggestions?: Array<{ label: string; action: string }>;
  };

  return (
    <section className="mt-6">
      <Panel className="border-brass/30">
        <PanelHead
          title="Weekly brief"
          icon={
            <span className="grid size-[26px] place-items-center rounded-md bg-brass-wash text-brass-deep">
              <IconSparkle size={15} />
            </span>
          }
          action={
            <span className="text-ink-tertiary">
              {/* A real moment, not a ledger date: shown in the user's own
                  wall-clock time. */}
              {formatInstant(notification.createdAt, actor.timezone, {
                day: "numeric",
                month: "short",
              })}
            </span>
          }
        />
        <PanelBody>
          <p className="text-base leading-relaxed font-medium">{notification.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{notification.body}</p>
          {data.suggestions?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.suggestions.map((s) => (
                <Link
                  key={s.label}
                  href={ACTION_HREF[s.action] ?? "/assistant"}
                  className="inline-flex h-7 items-center rounded-full border border-rule bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-rule-strong hover:text-ink"
                >
                  {s.label}
                </Link>
              ))}
              <Link
                href="/assistant"
                className="inline-flex h-7 items-center rounded-full border border-rule bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-rule-strong hover:text-ink"
              >
                Ask a follow-up
              </Link>
            </div>
          ) : null}
        </PanelBody>
      </Panel>
    </section>
  );
}
