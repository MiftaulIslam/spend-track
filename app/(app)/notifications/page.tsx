import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Badge, EmptyState, Panel, PanelBody } from "@/src/components/ui";
import { IconBell } from "@/src/components/icons";
import { MarkAllReadButton } from "./mark-all-read";
import * as notificationService from "@/src/server/services/notification-service";

export const metadata = { title: "Notifications" };

/** Severity is the service's word; these are the badge tones that match it. */
const SEVERITY_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  CRITICAL: "danger",
  URGENT: "danger",
  WARNING: "warning",
  INFO: "info",
};

function when(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function NotificationsPage() {
  const actor = await requireUserPage("/notifications");
  const { items, unreadCount } = await notificationService.list(actor, { limit: 50 });

  return (
    <>
      <AppBar
        title="Notifications"
        sub={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={unreadCount > 0 ? <MarkAllReadButton /> : null}
      />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {items.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconBell />}
                title="Nothing to read"
                body="Bills coming due, budgets running hot and unusual charges show up here."
              />
            </Panel>
          ) : (
            <Panel>
              <PanelBody className="px-0 pb-0">
                {items.map((n) => {
                  const unread = !n.readAt;
                  const row = (
                    <div
                      className={`flex gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0 ${
                        unread ? "bg-brass-wash/30" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                          unread ? "bg-brass" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{n.title}</span>
                          <Badge tone={SEVERITY_TONE[n.severity] ?? "neutral"}>
                            {n.severity.toLowerCase()}
                          </Badge>
                          <span className="ml-auto shrink-0 text-2xs text-ink-tertiary">
                            {when(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                          {n.body}
                        </p>
                      </div>
                    </div>
                  );

                  return n.href ? (
                    <Link key={n.id} href={n.href} className="block hover:bg-sunken">
                      {row}
                    </Link>
                  ) : (
                    <div key={n.id}>{row}</div>
                  );
                })}
              </PanelBody>
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}
