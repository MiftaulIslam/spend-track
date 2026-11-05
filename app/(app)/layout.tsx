import { redirect } from "next/navigation";
import { getActor } from "@/src/server/auth/guards";
import { AppChrome } from "@/src/components/app-chrome";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/src/server/db";
import { billOccurrences, bills, notifications, transactions } from "@/src/server/db/schema";
import * as categoryService from "@/src/server/services/category-service";
import * as accountService from "@/src/server/services/account-service";
import { addDays } from "@/src/domain/schedule";
import { todayInTimezone } from "@/src/domain/datetime";

/**
 * The authenticated shell.
 *
 * Loads once per navigation and passes the small amount of data the chrome
 * needs — accounts and categories for quick add, counts for the nav badges.
 * Everything else is fetched by the page itself, so a slow panel cannot hold
 * up the shell.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await getActor();
  if (!actor) redirect("/signin");

  const [accounts, categories, unread, billsDue, recentCategories] = await Promise.all([
    accountService.list(actor),
    categoryService.flat(actor, {}),
    db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, actor.userId),
          isNull(notifications.readAt),
          isNull(notifications.dismissedAt),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: count() })
      .from(billOccurrences)
      .where(
        and(
          inArray(billOccurrences.status, ["DUE", "OVERDUE"]),
          inArray(
            billOccurrences.billId,
            db
              .select({ id: bills.id })
              .from(bills)
              .where(and(eq(bills.userId, actor.userId), isNull(bills.deletedAt))),
          ),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    // Most-used categories, so quick add's first row is usually the right one.
    db
      .select({ categoryId: transactions.categoryId, n: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, actor.userId),
          isNull(transactions.deletedAt),
          isNotNull(transactions.categoryId),
          gte(transactions.occurredAt, addDays(new Date(), -60)),
        ),
      )
      .groupBy(transactions.categoryId)
      .orderBy(desc(count()))
      .limit(6),
  ]);

  // A zero-account user is NOT redirected out of the shell.
  //
  // This gate used to send them to /welcome "for setup". /welcome is the
  // marketing page, and its only call to action is Sign in -> /signin, which
  // sees a valid session and redirects to / -- straight back into this layout
  // and out to /welcome again. Because the gate lives in the layout that wraps
  // every (app) route, there was no reachable escape: /accounts, /transactions
  // and /budgets all bounced too, so a newly signed-up user could not reach any
  // part of the product.
  //
  // Every page already renders its own empty state for the no-data case, which
  // is what the gate was reaching for. Onboarding belongs on a route that does
  // not sit inside this layout; until that exists, the empty states are the
  // onboarding.

  const initials = (actor.name ?? actor.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppChrome
        user={{
          name: actor.name ?? actor.email,
          email: actor.email,
          initials: initials || "ST",
          householdRole: actor.householdRole,
          isAdmin: actor.isAdmin,
        }}
        badges={{ unread, billsDue }}
        accounts={accounts
          .filter((a) => !a.archivedAt)
          .map((a) => ({
            id: a.id,
            name: a.name,
            currency: a.currency,
            type: a.type,
            mask: a.mask,
          }))}
        categories={categories.map((c) => ({
          id: c.id,
          label: c.label,
          name: c.name,
          colorIndex: c.colorIndex,
          kind: c.kind,
        }))}
        recentCategoryIds={recentCategories
          .map((r) => r.categoryId)
          .filter((id): id is string => Boolean(id))}
        // Resolved here, from the user's own setting, so every date input
        // downstream agrees on what day it is.
        today={todayInTimezone(actor.timezone)}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
