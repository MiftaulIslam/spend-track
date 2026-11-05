import { and, count, eq, isNull } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import {
  accounts as accountsTable,
  budgets as budgetsTable,
  categories,
  notificationPreferences,
  transactions as transactionsTable,
  userSettings,
} from "@/src/server/db/schema";
import { slugify } from "./tag-service";

/**
 * What a brand-new account gets.
 *
 * An empty ledger with no categories is not a blank slate, it is a chore. Every
 * new user starts with a category tree that covers ordinary life, sensible
 * notification defaults, and their settings row — so the first expense they add
 * can be categorised in one tap.
 */

interface SeedCategory {
  name: string;
  colorIndex: number;
  icon: string;
  children?: string[];
}

export const DEFAULT_EXPENSE_CATEGORIES: SeedCategory[] = [
  { name: "Food & dining", colorIndex: 1, icon: "store", children: ["Restaurants", "Coffee shops", "Takeaway", "Bars"] },
  { name: "Groceries", colorIndex: 3, icon: "store", children: ["Supermarket", "Farmers market", "Specialty"] },
  { name: "Transport", colorIndex: 2, icon: "car", children: ["Rideshare", "Public transit", "Fuel", "Parking", "Car maintenance"] },
  { name: "Housing", colorIndex: 4, icon: "home", children: ["Rent", "Mortgage", "Home maintenance", "Furnishings"] },
  { name: "Utilities", colorIndex: 6, icon: "zap", children: ["Electricity", "Gas", "Water", "Internet", "Phone"] },
  { name: "Entertainment", colorIndex: 5, icon: "sparkle", children: ["Streaming", "Events", "Games", "Books"] },
  { name: "Shopping", colorIndex: 7, icon: "tag", children: ["Clothing", "Electronics", "Household", "Gifts"] },
  { name: "Health", colorIndex: 8, icon: "shield", children: ["Doctor", "Pharmacy", "Dental", "Fitness", "Insurance"] },
  { name: "Education", colorIndex: 9, icon: "file", children: ["Tuition", "Courses", "Supplies"] },
  { name: "Personal care", colorIndex: 10, icon: "users", children: ["Haircut", "Cosmetics", "Spa"] },
  { name: "Travel", colorIndex: 11, icon: "plane", children: ["Flights", "Lodging", "Transport", "Activities"] },
  { name: "Fees & charges", colorIndex: 12, icon: "receipt", children: ["Bank fees", "Interest", "Late fees", "Service charges"] },
  { name: "Other", colorIndex: 12, icon: "tag" },
];

export const DEFAULT_INCOME_CATEGORIES: SeedCategory[] = [
  { name: "Salary", colorIndex: 3, icon: "wallet" },
  { name: "Freelance", colorIndex: 3, icon: "file" },
  { name: "Business", colorIndex: 4, icon: "store" },
  { name: "Investment", colorIndex: 11, icon: "chart", children: ["Dividends", "Interest", "Capital gains"] },
  { name: "Rental", colorIndex: 4, icon: "home" },
  { name: "Gifts received", colorIndex: 10, icon: "sparkle" },
  { name: "Other income", colorIndex: 12, icon: "wallet" },
];

/** Channel defaults: urgent things push, routine things stay in-app. */
const NOTIFICATION_DEFAULTS: Array<[string, boolean, boolean, boolean]> = [
  ["BILL_DUE", true, true, false],
  ["BILL_OVERDUE", true, true, true],
  ["BUDGET_THRESHOLD", true, false, false],
  ["BUDGET_EXCEEDED", true, true, false],
  ["UNUSUAL_TRANSACTION", true, true, false],
  ["SUBSCRIPTION_RENEWAL", true, false, false],
  ["TRIAL_ENDING", true, true, false],
  ["LOW_BALANCE", true, true, false],
  ["GOAL_MILESTONE", true, false, false],
  ["GOAL_COMPLETED", true, true, false],
  ["RECURRING_CREATED", true, false, false],
  ["MONTHLY_SUMMARY", true, false, true],
  ["WEEKLY_BRIEF", true, false, false],
  ["NEW_SIGN_IN", true, true, true],
  ["IMPORT_COMPLETE", true, false, false],
  ["REPORT_READY", true, false, false],
  ["RECEIPT_PROCESSED", true, false, false],
  ["HOUSEHOLD_INVITE", true, true, true],
  ["SECURITY_ALERT", true, true, true],
];

/**
 * Idempotent: safe to call again for an existing user. The Auth.js `createUser`
 * event can fire more than once in edge cases, and a duplicate category tree
 * would be worse than a no-op.
 */
export async function seedDefaultsForUser(userId: string, db: Db = rootDb): Promise<void> {
  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { id: true },
  });
  if (existing) return;

  await db.insert(userSettings).values({ userId });

  await db
    .insert(notificationPreferences)
    .values(
      NOTIFICATION_DEFAULTS.map(([kind, inApp, push, email]) => ({
        userId,
        kind: kind as never,
        inApp,
        push,
        email,
      })),
    )
    .onConflictDoNothing();

  await seedCategories(userId, db);
}

export async function seedCategories(userId: string, db: Db = rootDb): Promise<number> {
  const [existingRow] = await db
    .select({ n: count() })
    .from(categories)
    .where(eq(categories.userId, userId));
  if ((existingRow?.n ?? 0) > 0) return 0;

  let created = 0;
  let sortOrder = 0;
  const used = new Set<string>();

  const makeSlug = (name: string): string => {
    const base = slugify(name) || "category";
    let candidate = base;
    let n = 1;
    while (used.has(candidate)) candidate = `${base}-${++n}`;
    used.add(candidate);
    return candidate;
  };

  for (const [kind, groups] of [
    ["EXPENSE", DEFAULT_EXPENSE_CATEGORIES],
    ["INCOME", DEFAULT_INCOME_CATEGORIES],
  ] as const) {
    for (const group of groups) {
      const [parent] = await db
        .insert(categories)
        .values({
          userId,
          name: group.name,
          slug: makeSlug(group.name),
          kind,
          colorIndex: group.colorIndex,
          icon: group.icon,
          sortOrder: sortOrder++,
          isSystem: true,
        })
        .returning({ id: categories.id });
      if (!parent) continue;
      created++;

      if (group.children?.length) {
        await db.insert(categories).values(
          group.children.map((child, index) => ({
            userId,
            name: child,
            slug: makeSlug(`${group.name} ${child}`),
            kind,
            parentId: parent.id,
            colorIndex: group.colorIndex,
            icon: group.icon,
            sortOrder: index,
            isSystem: true,
          })),
        );
        created += group.children.length;
      }
    }
  }

  return created;
}

/** Progress through the setup flow, driven by what actually exists. */
export async function onboardingState(userId: string, db: Db = rootDb) {
  const [settings, accounts, transactions, budgets] = await Promise.all([
    db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
      columns: { baseCurrency: true, onboardingStep: true, onboardingCompletedAt: true },
    }),
    db
      .select({ n: count() })
      .from(accountsTable)
      .where(and(eq(accountsTable.userId, userId), isNull(accountsTable.deletedAt)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: count() })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), isNull(transactionsTable.deletedAt)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: count() })
      .from(budgetsTable)
      .where(and(eq(budgetsTable.userId, userId), isNull(budgetsTable.deletedAt)))
      .then((r) => r[0]?.n ?? 0),
  ]);

  const steps = [
    { key: "currency", label: "Choose your currency", done: Boolean(settings?.baseCurrency) },
    { key: "accounts", label: "Add your accounts", done: accounts > 0 },
    { key: "income", label: "Record your income", done: transactions > 0 },
    { key: "budget", label: "Set a first budget", done: budgets > 0 },
  ];

  return {
    steps,
    currentStep: steps.findIndex((s) => !s.done),
    complete: Boolean(settings?.onboardingCompletedAt) || steps.every((s) => s.done),
    counts: { accounts, transactions, budgets },
  };
}

export async function completeOnboarding(userId: string, db: Db = rootDb): Promise<void> {
  await db
    .update(userSettings)
    .set({ onboardingCompletedAt: new Date(), onboardingStep: 4 })
    .where(eq(userSettings.userId, userId));
}
