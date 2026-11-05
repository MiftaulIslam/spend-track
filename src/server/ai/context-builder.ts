import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { categories, transactions } from "@/src/server/db/schema";
import { todayInTimezone } from "@/src/domain/datetime";
import type { ActorContext } from "@/src/server/auth/guards";
import * as accountService from "@/src/server/services/account-service";
import * as analyticsService from "@/src/server/services/analytics-service";
import * as budgetService from "@/src/server/services/budget-service";

/**
 * Context builder + permission filter.
 *
 * Claude never queries anything. It is handed a compact, pre-filtered snapshot
 * assembled here, through the same services the UI uses, under the same actor.
 * Two consequences worth stating plainly:
 *
 *  - The model cannot see data the actor cannot see, because the services it is
 *    built from already scope by `userId`.
 *  - The model cannot see *more* than it needs: this is a summary, not a dump.
 *    Detail comes from tool calls, which are individually authorised.
 */

export interface AIContext {
  system: string;
  /** Rough size, so the caller can decide whether to trim before sending. */
  approxTokens: number;
}

const HOUSEHOLD_ROLE_NOTE: Record<string, string> = {
  OWNER: "They own their household and can change anything in it.",
  ADMIN: "They are a household admin and can manage shared accounts, budgets and members.",
  MEMBER: "They are a household member. They can record their own transactions but not edit other people's or change shared plans.",
  VIEWER: "They are a household viewer with read-only access. Do not propose any change to their data.",
};

/**
 * The system prompt.
 *
 * The rules here are the ones that keep answers trustworthy: never invent a
 * number, always call a tool before stating a figure, and be explicit that a
 * mutation is a proposal rather than a completed action.
 */
export async function buildSystemPrompt(
  actor: ActorContext,
  options: { includeMutating?: boolean; db?: Db } = {},
): Promise<AIContext> {
  const db = options.db ?? rootDb;

  const [accounts, overview, budgets, categoryCount, txnCount, oldest] = await Promise.all([
    accountService.list(actor),
    analyticsService.overview(actor, { period: "MONTHLY" }, db),
    budgetService.list(actor, {}, db),
    db
      .select({ n: count() })
      .from(categories)
      .where(and(eq(categories.userId, actor.userId), isNull(categories.archivedAt)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, actor.userId), isNull(transactions.deletedAt)))
      .then((r) => r[0]?.n ?? 0),
    db.query.transactions.findFirst({
      where: and(eq(transactions.userId, actor.userId), isNull(transactions.deletedAt)),
      orderBy: [asc(transactions.occurredAt)],
      columns: { occurredAt: true },
    }),
  ]);

  const accountLines = accounts
    .filter((a) => !a.archivedAt)
    .map(
      (a) =>
        `- ${a.name} (${a.type}, ${a.currency})${a.isLiability ? " — liability" : ""}: ${a.balance.decimal}` +
        (a.creditLimit ? ` of ${a.creditLimit.decimal} limit` : ""),
    )
    .join("\n");

  const budgetLines = budgets
    .map(
      (b) =>
        `- ${b.name} (${b.period}, ${b.window.label}): ${b.totalSpent.decimal} of ${b.totalLimit.decimal} spent, ` +
        `${(b.usedFraction * 100).toFixed(0)}% used at ${(b.elapsedFraction * 100).toFixed(0)}% through the period — ${b.health}`,
    )
    .join("\n");

  const system = `You are the financial assistant inside SpendTrack, a personal finance product. You are talking to ${actor.name ?? "the account holder"} about their own money.

Today is ${todayInTimezone(actor.timezone)} (${actor.timezone}). Their base currency is ${actor.baseCurrency}, their locale is ${actor.locale}.
${actor.householdRole ? HOUSEHOLD_ROLE_NOTE[actor.householdRole] ?? "" : "They manage their finances alone."}

## What you must never do

1. **Never state a figure you have not obtained from a tool.** You cannot do reliable
   arithmetic over a list of transactions and you do not need to — the tools return
   exact totals computed by the database. If you need a number, call a tool. If a tool
   fails, say the number is unavailable rather than estimating one.
2. **Never present a change as done.** Every mutating tool returns a proposal that the
   person must confirm in the interface. Say "here's the change I'd make" — not "I've
   updated it". They will see a confirmation card and decide.
3. **Never guess an id.** Use the search tools to find the real record first. Account and
   category names work fine as arguments; the system resolves them.
4. **Never advise on specific investments** and do not present yourself as a licensed
   financial adviser. Explaining the user's own data, and general budgeting or debt
   strategy, is fine.

## How to be useful

- Answer the question that was asked, with the specific figures behind it. "You spent
  $348.15 on dining against a $280 budget" beats "you overspent on dining".
- When a number is surprising, say what drove it — the three transactions, the one
  merchant, the price increase.
- Money direction matters: transfers between the user's own accounts and credit-card
  payments are not spending, and refunds reduce spending in their original category.
  The tools already apply these rules; do not re-derive them.
- A budget percentage is only meaningful next to how much of the period has elapsed.
  85% used on day 5 is a problem; on day 28 it is fine. The budget tool gives you both.
- Keep answers short. A table or three bullets beats four paragraphs.

## Their current position

Accounts:
${accountLines || "- No accounts yet."}

Net worth: ${overview.netWorth.net.decimal} ${actor.baseCurrency} (assets ${overview.netWorth.assets.decimal}, liabilities ${overview.netWorth.liabilities.decimal})

This period (${overview.range.label}):
- Income ${overview.income.decimal}, spending ${overview.spending.decimal}, net ${overview.net.decimal}
- Savings rate ${(overview.savingsRate * 100).toFixed(1)}%
- ${overview.transactionCount} transactions recorded

Budgets:
${budgetLines || "- No budgets set."}

Ledger: ${txnCount.toLocaleString()} transactions across ${categoryCount} categories${
    oldest ? `, starting ${oldest.occurredAt.toISOString().slice(0, 10)}` : ""
  }.

${
  options.includeMutating
    ? "You may propose changes using the mutating tools. Each one returns a proposal for the person to confirm."
    : "You have read-only tools in this conversation. If the person asks for a change, explain what you would do and tell them you need them to enable changes or make it themselves."
}`;

  return { system, approxTokens: Math.ceil(system.length / 3.6) };
}

/**
 * Strip fields an actor's role must not see before anything reaches the model.
 *
 * Household viewers and members get the same tool results as anyone else today,
 * but this is the single choke point where that changes — so the filter exists
 * even where it is currently a pass-through, rather than being retrofitted
 * later into fifteen call sites.
 */
export function filterForRole(actor: ActorContext, payload: unknown): unknown {
  if (actor.householdRole === "VIEWER" || actor.householdRole === "MEMBER") {
    return redactKeys(payload, ["ipHash", "userAgent", "storageKey", "externalRef"]);
  }
  return redactKeys(payload, ["ipHash", "storageKey"]);
}

function redactKeys(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => redactKeys(v, keys));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keys.includes(k)) continue;
      out[k] = redactKeys(v, keys);
    }
    return out;
  }
  return value;
}

/**
 * Compact a tool result before it goes back to the model.
 *
 * A 100-row transaction list is ~8k tokens; most questions need the rows, but a
 * runaway result would eat the window and push out the actual conversation.
 */
export function capToolResult(result: unknown, maxChars = 24_000): string {
  const json = JSON.stringify(result, null, 0);
  if (json.length <= maxChars) return json;
  return `${json.slice(0, maxChars)}\n…truncated. Narrow the query (a shorter date range or fewer categories) for the full result.`;
}
