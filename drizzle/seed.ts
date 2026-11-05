/**
 * Seed script.
 *
 * Creates the four QA accounts the test plan uses, plus three years of realistic
 * history for the main one. "Realistic" matters here: a ledger of round numbers
 * on the 1st of every month hides pagination bugs, pace-marker bugs, anomaly
 * detection bugs and chart-scaling bugs that a real ledger exposes immediately.
 *
 *   pnpm db:seed
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../src/server/db";
import * as t from "../src/server/db/schema";
// The same generator the engine uses, so the seed's idea of "already run" and
// the engine's idea of "next due" cannot drift apart.
import { occurrences, nextOccurrence } from "../src/domain/schedule";



const PASSWORD = "password123";

/* ------------------------------------------------------------ utilities */

/** Deterministic PRNG so every seed run produces the same ledger. */
let seedState = 0x2f6e2b1;
function random(): number {
  seedState ^= seedState << 13;
  seedState ^= seedState >>> 17;
  seedState ^= seedState << 5;
  return ((seedState >>> 0) % 1_000_000) / 1_000_000;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number): number => min + random() * (max - min);
const cents = (major: number): bigint => BigInt(Math.round(major * 100));

const utc = (y: number, m: number, d: number, h = 12, min = 0): Date =>
  new Date(Date.UTC(y, m, d, h, min));

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

/* ---------------------------------------------------------- definitions */

const EXPENSE_TREE: Array<{ name: string; color: number; icon: string; children: string[] }> = [
  { name: "Food & dining", color: 1, icon: "store", children: ["Restaurants", "Coffee shops", "Takeaway", "Bars"] },
  { name: "Groceries", color: 3, icon: "store", children: ["Supermarket", "Farmers market", "Specialty"] },
  { name: "Transport", color: 2, icon: "car", children: ["Rideshare", "Public transit", "Fuel", "Parking", "Car maintenance"] },
  { name: "Housing", color: 4, icon: "home", children: ["Rent", "Home maintenance", "Furnishings"] },
  { name: "Utilities", color: 6, icon: "zap", children: ["Electricity", "Gas", "Water", "Internet", "Phone"] },
  { name: "Entertainment", color: 5, icon: "sparkle", children: ["Streaming", "Events", "Games", "Books"] },
  { name: "Shopping", color: 7, icon: "tag", children: ["Clothing", "Electronics", "Household", "Gifts"] },
  { name: "Health", color: 8, icon: "shield", children: ["Doctor", "Pharmacy", "Dental", "Fitness", "Insurance"] },
  { name: "Education", color: 9, icon: "file", children: ["Tuition", "Courses", "Supplies"] },
  { name: "Personal care", color: 10, icon: "users", children: ["Haircut", "Cosmetics", "Spa"] },
  { name: "Travel", color: 11, icon: "plane", children: ["Flights", "Lodging", "Activities"] },
  { name: "Fees & charges", color: 12, icon: "receipt", children: ["Bank fees", "Interest", "Late fees"] },
];

const INCOME_TREE: Array<{ name: string; color: number; icon: string; children: string[] }> = [
  { name: "Salary", color: 3, icon: "wallet", children: [] },
  { name: "Freelance", color: 3, icon: "file", children: [] },
  { name: "Investment", color: 11, icon: "chart", children: ["Dividends", "Interest"] },
  { name: "Gifts received", color: 10, icon: "sparkle", children: [] },
  { name: "Other income", color: 12, icon: "wallet", children: [] },
];

/**
 * Merchants with the shape of their spending. `weight` is how often they turn
 * up; the amount range is what makes the anomaly detector and the median-based
 * budget suggester have something real to work with.
 */
const MERCHANTS: Array<{
  name: string; category: string; min: number; max: number; weight: number; descriptor: string;
}> = [
  { name: "Blue Bottle Coffee", category: "Coffee shops", min: 4.5, max: 9.5, weight: 26, descriptor: "TST* BLUE BOTTLE" },
  { name: "Whole Foods Market", category: "Supermarket", min: 38, max: 142, weight: 18, descriptor: "WHOLEFDS BKN 10259" },
  { name: "Trader Joe's", category: "Supermarket", min: 22, max: 88, weight: 12, descriptor: "TRADER JOE'S #542" },
  { name: "Uber", category: "Rideshare", min: 8.4, max: 46, weight: 20, descriptor: "UBER *TRIP" },
  { name: "MTA", category: "Public transit", min: 2.9, max: 34, weight: 10, descriptor: "MTA*NYCT PAYGO" },
  { name: "Amazon", category: "Household", min: 12, max: 180, weight: 14, descriptor: "AMZN MKTP US*2K41Z" },
  { name: "Di An Di", category: "Restaurants", min: 38, max: 96, weight: 6, descriptor: "SQ *DI AN DI BROOKLYN" },
  { name: "Lilia", category: "Restaurants", min: 110, max: 280, weight: 2, descriptor: "TST* LILIA" },
  { name: "Chipotle", category: "Takeaway", min: 11, max: 28, weight: 9, descriptor: "CHIPOTLE 1892" },
  { name: "Threes Brewing", category: "Bars", min: 18, max: 72, weight: 5, descriptor: "SQ *THREES BREWING" },
  { name: "Rite Aid", category: "Pharmacy", min: 8, max: 62, weight: 7, descriptor: "RITE AID 05821" },
  { name: "Equinox", category: "Fitness", min: 215, max: 215, weight: 1, descriptor: "EQUINOX BROOKLYN" },
  { name: "Kinokuniya", category: "Books", min: 16, max: 84, weight: 4, descriptor: "KINOKUNIYA NY" },
  { name: "Uniqlo", category: "Clothing", min: 24, max: 168, weight: 5, descriptor: "UNIQLO USA" },
  { name: "Apple", category: "Electronics", min: 29, max: 1299, weight: 2, descriptor: "APPLE.COM/BILL" },
  { name: "Shell", category: "Fuel", min: 32, max: 78, weight: 4, descriptor: "SHELL OIL 574212" },
  { name: "Sephora", category: "Cosmetics", min: 22, max: 140, weight: 3, descriptor: "SEPHORA #1204" },
  { name: "Duane Reade", category: "Pharmacy", min: 6, max: 38, weight: 6, descriptor: "DUANE READE 14021" },
];

async function main() {
  console.log("Resetting seed data…");
  await reset();

  const owner = await seedOwner();
  await seedNewUser();
  await seedMember(owner.householdId);
  await seedAdmin();
  await seedExchangeRates();

  console.log("\nQA accounts (password: password123)");
  console.log("  qa.owner@spendtrack.test   full ledger, 3 years of history");
  console.log("  qa.new@spendtrack.test     brand-new account, empty states");
  console.log("  qa.member@spendtrack.test  household member, limited permissions");
  console.log("  qa.admin@spendtrack.test   platform super admin");
}

async function reset() {
  // Ordered so foreign keys never block a delete. Cascades handle the rest.
  await db.delete(t.aiToolCalls);
  await db.delete(t.aiMessages);
  await db.delete(t.aiConversations);
  await db.delete(t.aiUsage);
  await db.delete(t.adminAuditLogs);
  await db.delete(t.adminUsers);
  await db.delete(t.systemEvents);
  await db.delete(t.auditLogs);
  await db.delete(t.notifications);
  await db.delete(t.transactionTags);
  await db.delete(t.transactionSplits);
  await db.delete(t.transactions);
  await db.delete(t.transfers);
  await db.delete(t.reconciliations);
  await db.delete(t.billOccurrences);
  await db.delete(t.bills);
  await db.delete(t.subscriptions);
  await db.delete(t.recurringOccurrences);
  await db.delete(t.recurringTransactions);
  await db.delete(t.budgetCategories);
  await db.delete(t.budgets);
  await db.delete(t.goalContributions);
  await db.delete(t.goalMilestones);
  await db.delete(t.goals);
  await db.delete(t.debtPayments);
  await db.delete(t.debts);
  await db.delete(t.lendingPayments);
  await db.delete(t.lendingRecords);
  await db.delete(t.importRows);
  await db.delete(t.importJobs);
  await db.delete(t.reportJobs);
  await db.delete(t.receiptLineItems);
  await db.delete(t.receipts);
  await db.delete(t.attachments);
  await db.delete(t.financialRules);
  await db.delete(t.merchantAliases);
  await db.delete(t.merchants);
  await db.delete(t.tags);
  await db.delete(t.categories);
  await db.delete(t.accounts);
  await db.delete(t.householdInvites);
  await db.delete(t.householdMembers);
  await db.delete(t.households);
  await db.delete(t.notificationPreferences);
  await db.delete(t.userSettings);
  await db.delete(t.sessions);
  await db.delete(t.authAccounts);
  await db.delete(t.loginAttempts);
  await db.delete(t.userConsents);
  await db.delete(t.pushSubscriptions);
  await db.delete(t.users);
  await db.delete(t.exchangeRates);
  await db.delete(t.rateLimitCounters);
  await db.delete(t.featureFlags);
  await db.delete(t.systemConfig);
}

async function createUser(email: string, name: string, baseCurrency = "USD") {
  const user = (await db.insert(t.users).values({
      email,
      name,
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      passwordSetAt: new Date(),
    }).returning({ id: t.users.id, email: t.users.email }))[0]!;

  await db.insert(t.userSettings).values({
    userId: user.id,
    baseCurrency,
    locale: "en-US",
    timezone: "America/New_York",
    onboardingCompletedAt: new Date(),
    onboardingStep: 4,
  });

  await db.insert(t.notificationPreferences).values([
      ["BILL_DUE", true, true, false], ["BILL_OVERDUE", true, true, true],
      ["BUDGET_THRESHOLD", true, false, false], ["BUDGET_EXCEEDED", true, true, false],
      ["UNUSUAL_TRANSACTION", true, true, false], ["SUBSCRIPTION_RENEWAL", true, false, false],
      ["TRIAL_ENDING", true, true, false], ["LOW_BALANCE", true, true, false],
      ["GOAL_MILESTONE", true, false, false], ["GOAL_COMPLETED", true, true, false],
      ["RECURRING_CREATED", true, false, false], ["MONTHLY_SUMMARY", true, false, true],
      ["WEEKLY_BRIEF", true, false, false], ["NEW_SIGN_IN", true, true, true],
      ["IMPORT_COMPLETE", true, false, false], ["REPORT_READY", true, false, false],
      ["RECEIPT_PROCESSED", true, false, false], ["HOUSEHOLD_INVITE", true, true, true],
      ["SECURITY_ALERT", true, true, true],
    ].map(([kind, inApp, push, email2]) => ({
      userId: user.id,
      kind: kind as never,
      inApp: inApp as boolean,
      push: push as boolean,
      email: email2 as boolean,
    })));

  return user;
}

async function seedCategories(userId: string) {
  const bySlug = new Map<string, string>();
  const used = new Set<string>();
  let order = 0;

  const unique = (name: string) => {
    let slug = slugify(name);
    let n = 1;
    while (used.has(slug)) slug = `${slugify(name)}-${++n}`;
    used.add(slug);
    return slug;
  };

  for (const [kind, tree] of [["EXPENSE", EXPENSE_TREE], ["INCOME", INCOME_TREE]] as const) {
    for (const group of tree) {
      const parent = (await db.insert(t.categories).values({
          userId, name: group.name, slug: unique(group.name), kind,
          colorIndex: group.color, icon: group.icon, sortOrder: order++, isSystem: true,
        }).returning({ id: t.categories.id }))[0]!;
      bySlug.set(group.name, parent.id);

      for (const [i, child] of group.children.entries()) {
        const row = (await db.insert(t.categories).values({
            userId, name: child, slug: unique(`${group.name} ${child}`), kind,
            parentId: parent.id, colorIndex: group.color, icon: group.icon,
            sortOrder: i, isSystem: true,
          }).returning({ id: t.categories.id }))[0]!;
        bySlug.set(child, row.id);
      }
    }
  }
  return bySlug;
}

/* ═══════════════════════════════════════════════════════════════ OWNER ══ */

async function seedOwner() {
  console.log("Seeding qa.owner@spendtrack.test — this creates ~3 years of history…");
  const user = await createUser("qa.owner@spendtrack.test", "Miftaul Islam");
  const categories = await seedCategories(user.id);

  const household = (await db.insert(t.households).values({
      name: "Bergen St",
      ownerId: user.id,
    }).returning({ id: t.households.id }))[0]!;

  await db.insert(t.householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
  });

  const accounts = {
    checking: (await db.insert(t.accounts).values({
        userId: user.id, name: "Chase Checking", type: "CHECKING", currency: "USD",
        institution: "JPMorgan Chase", mask: "8821", colorIndex: 6, icon: "wallet",
        openingBalanceMinor: cents(4200), sortOrder: 0, isDefault: true,
        visibility: "HOUSEHOLD", lastReconciledAt: utc(2025, 8, 2),
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    savings: (await db.insert(t.accounts).values({
        userId: user.id, name: "Ally Savings", type: "SAVINGS", currency: "USD",
        institution: "Ally Bank", mask: "4410", colorIndex: 3, icon: "shield",
        openingBalanceMinor: cents(1500), interestRateBps: 420, sortOrder: 1,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    amex: (await db.insert(t.accounts).values({
        userId: user.id, name: "Amex Gold", type: "CREDIT_CARD", currency: "USD",
        institution: "American Express", mask: "4021", colorIndex: 1, icon: "receipt",
        creditLimitMinor: cents(10_000), statementDay: 25, paymentDueDay: 2,
        aprBps: 2474, sortOrder: 2,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    freedom: (await db.insert(t.accounts).values({
        userId: user.id, name: "Chase Freedom", type: "CREDIT_CARD", currency: "USD",
        mask: "9910", colorIndex: 5, icon: "receipt",
        creditLimitMinor: cents(5000), statementDay: 12, paymentDueDay: 9,
        aprBps: 0, sortOrder: 3,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    cash: (await db.insert(t.accounts).values({
        userId: user.id, name: "Cash", type: "CASH", currency: "USD",
        colorIndex: 12, icon: "wallet", openingBalanceMinor: cents(300), sortOrder: 4,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    // A second currency, so multi-currency paths are exercised by default.
    revolut: (await db.insert(t.accounts).values({
        userId: user.id, name: "Revolut", type: "PREPAID", currency: "EUR",
        colorIndex: 2, icon: "wallet", openingBalanceMinor: cents(600), sortOrder: 5,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    brokerage: (await db.insert(t.accounts).values({
        userId: user.id, name: "Fidelity Brokerage", type: "INVESTMENT", currency: "USD",
        colorIndex: 3, icon: "chart", openingBalanceMinor: cents(31_000), sortOrder: 6,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
    auto: (await db.insert(t.accounts).values({
        userId: user.id, name: "Auto loan · Toyota", type: "LOAN", currency: "USD",
        // Liability balances are signed negative — see domain/ledger.ts.
        colorIndex: 4, icon: "car", openingBalanceMinor: cents(-12_240),
        aprBps: 490, sortOrder: 7,
      }).returning({ id: t.accounts.id, currency: t.accounts.currency }))[0]!,
  };

  // Merchants + aliases, so descriptor normalisation has real data to work on.
  const merchantIds = new Map<string, string>();
  for (const m of MERCHANTS) {
    const merchant = (await db.insert(t.merchants).values({
        userId: user.id,
        name: m.name,
        normalizedName: m.name.toUpperCase(),
        defaultCategoryId: categories.get(m.category) ?? null,
      }).returning({ id: t.merchants.id }))[0]!;
    await db
      .insert(t.merchantAliases)
      .values({ merchantId: merchant.id, pattern: m.descriptor.toUpperCase() });
    merchantIds.set(m.name, merchant.id);
  }

  const tags = await Promise.all(
    ["reimbursable", "business", "anniversary", "deductible"].map((name) =>
      db
        .insert(t.tags)
        .values({ userId: user.id, name, slug: slugify(name), colorIndex: 11 })
        .returning({ id: t.tags.id, name: t.tags.name })
        .then((r) => r[0]!),
    ),
  );

  await generateHistory(user.id, accounts, categories, merchantIds, tags);
  await seedPlanning(user.id, accounts, categories, merchantIds);
  await seedOperational(user.id, accounts, categories);

  await refreshBalances(user.id);
  return { id: user.id, householdId: household.id };
}

type Accounts = Awaited<ReturnType<typeof seedOwner>> extends never ? never : Record<string, { id: string; currency: string }>;

/**
 * Three years of transactions.
 *
 * Built month by month so income, rent and recurring charges land on their real
 * dates, and discretionary spending varies the way it actually does — with a
 * December that costs more and a couple of outliers the anomaly detector should
 * find.
 */
async function generateHistory(
  userId: string,
  accounts: Accounts,
  categories: Map<string, string>,
  merchants: Map<string, string>,
  tags: Array<{ id: string; name: string }>,
) {
  const today = new Date();
  const startYear = today.getUTCFullYear() - 2;
  const rows: Array<Record<string, unknown>> = [];
  const weightedMerchants = MERCHANTS.flatMap((m) => Array<typeof m>(m.weight).fill(m));

  let salary = 5180;
  let amexChargesLastMonth = 700;

  for (let year = startYear; year <= today.getUTCFullYear(); year++) {
    for (let month = 0; month < 12; month++) {
      const monthStart = utc(year, month, 1);
      if (monthStart > today) break;
      if (year === startYear && month < today.getUTCMonth()) {
        // Start exactly 24 months back rather than mid-year.
        if (month < today.getUTCMonth()) continue;
      }

      // A raise each January, so year-over-year comparison shows something.
      if (month === 0 && year > startYear) salary = Math.round(salary * 1.06);

      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const isDecember = month === 11;

      // ---- income ------------------------------------------------------
      // Paid semi-monthly, which is both common and what keeps mid-month
      // dashboards from showing zero income.
      for (const payday of [15, Math.min(daysInMonth, 30)]) {
        pushIfPast(rows, today, {
          userId, accountId: accounts.checking.id, type: "INCOME", direction: 1,
          amountMinor: cents(salary / 2), currency: "USD",
          baseAmountMinor: cents(salary / 2), baseCurrency: "USD",
          occurredAt: utc(year, month, payday, 9),
          postedAt: utc(year, month, payday, 9),
          categoryId: categories.get("Salary"), description: "Northwind Labs payroll",
          status: "CLEARED", createdVia: "RECURRING",
        });
      }

      // Freelance, but not every month — irregular income is the realistic case.
      if (random() > 0.45) {
        const amount = Math.round(between(900, 2600));
        pushIfPast(rows, today, {
          userId, accountId: accounts.checking.id, type: "INCOME", direction: 1,
          amountMinor: cents(amount), currency: "USD",
          baseAmountMinor: cents(amount), baseCurrency: "USD",
          occurredAt: utc(year, month, Math.floor(between(8, 22)), 14),
          categoryId: categories.get("Freelance"), description: "Vireo Studio invoice",
          status: "CLEARED", createdVia: "MANUAL",
        });
      }

      // ---- fixed costs -------------------------------------------------
      const rent = year >= today.getUTCFullYear() - 1 ? 1650 : 1580;
      pushIfPast(rows, today, {
        userId, accountId: accounts.checking.id, type: "EXPENSE", direction: -1,
        amountMinor: cents(rent), currency: "USD",
        baseAmountMinor: cents(rent), baseCurrency: "USD",
        occurredAt: utc(year, month, 1, 8),
        categoryId: categories.get("Rent"), description: "Rent · 214 Bergen St",
        status: "CLEARED", createdVia: "RECURRING",
      });

      // Electricity swings with the season — this is what makes a "variable
      // bill" estimate worth computing rather than assuming.
      const seasonal = Math.abs(month - 6) / 6;
      const power = Math.round(between(78, 104) + seasonal * 62);
      pushIfPast(rows, today, {
        userId, accountId: accounts.checking.id, type: "EXPENSE", direction: -1,
        amountMinor: cents(power), currency: "USD",
        baseAmountMinor: cents(power), baseCurrency: "USD",
        occurredAt: utc(year, month, 22, 10),
        categoryId: categories.get("Electricity"), description: "Con Edison",
        status: "CLEARED", createdVia: "RECURRING",
      });

      for (const [name, amount, day, category, accountId] of [
        ["Verizon Fios", 89.99, 12, "Internet", accounts.checking.id],
        ["T-Mobile", 65, 18, "Phone", accounts.checking.id],
        ["Spotify Family", 19.99, 20, "Streaming", accounts.amex.id],
        ["iCloud+ 2TB", 9.99, 3, "Streaming", accounts.amex.id],
        ["Adobe Creative Cloud", 59.99, 17, "Streaming", accounts.amex.id],
        ["Equinox", 215, 28, "Fitness", accounts.checking.id],
        ["Renters insurance", 18.5, 25, "Insurance", accounts.checking.id],
      ] as const) {
        pushIfPast(rows, today, {
          userId, accountId, type: "EXPENSE", direction: -1,
          amountMinor: cents(amount), currency: "USD",
          baseAmountMinor: cents(amount), baseCurrency: "USD",
          occurredAt: utc(year, month, Math.min(day, daysInMonth), 6),
          categoryId: categories.get(category), description: name,
          merchantId: merchants.get(name) ?? null,
          status: "CLEARED", createdVia: "RECURRING",
        });
      }

      // ---- auto loan ---------------------------------------------------
      pushIfPast(rows, today, {
        userId, accountId: accounts.checking.id, type: "DEBT_PAYMENT", direction: -1,
        amountMinor: cents(384.22), currency: "USD",
        baseAmountMinor: cents(384.22), baseCurrency: "USD",
        occurredAt: utc(year, month, Math.min(24, daysInMonth), 7),
        description: "Auto loan payment", status: "CLEARED", createdVia: "RECURRING",
        excludeFromBudget: true,
      });

      // ---- discretionary ------------------------------------------------
      let amexCharges = 0;
      const count = Math.round(between(20, 30) * (isDecember ? 1.3 : 1));
      for (let i = 0; i < count; i++) {
        const merchant = pick(weightedMerchants);
        const day = Math.floor(between(1, daysInMonth + 1));
        const amount = Number(between(merchant.min, merchant.max).toFixed(2));
        const accountId = random() > 0.42 ? accounts.amex.id : accounts.checking.id;
        if (accountId === accounts.amex.id) amexCharges += amount;

        pushIfPast(rows, today, {
          userId, accountId, type: "EXPENSE", direction: -1,
          amountMinor: cents(amount), currency: "USD",
          baseAmountMinor: cents(amount), baseCurrency: "USD",
          occurredAt: utc(year, month, Math.min(day, daysInMonth), Math.floor(between(7, 22)), Math.floor(between(0, 60))),
          categoryId: categories.get(merchant.category) ?? null,
          merchantId: merchants.get(merchant.name) ?? null,
          description: merchant.name,
          rawDescriptor: merchant.descriptor,
          status: "CLEARED", createdVia: random() > 0.75 ? "IMPORT" : "MANUAL",
        });
      }

      // ---- savings transfer ---------------------------------------------
      if (random() > 0.2) {
        const amount = Math.round(between(700, 1200) / 50) * 50;
        const when = utc(year, month, Math.min(daysInMonth, 28), 11);
        if (when <= today) {
          const transfer = (await db.insert(t.transfers).values({
              userId, kind: "TRANSFER",
              fromAccountId: accounts.checking.id, toAccountId: accounts.savings.id,
              fromAmountMinor: cents(amount), fromCurrency: "USD",
              toAmountMinor: cents(amount), toCurrency: "USD",
              occurredAt: when, note: "To savings",
            }).returning({ id: t.transfers.id }))[0]!;
          rows.push(
            {
              userId, accountId: accounts.checking.id, type: "TRANSFER_OUT", direction: -1,
              amountMinor: cents(amount), currency: "USD",
              baseAmountMinor: cents(amount), baseCurrency: "USD",
              occurredAt: when, description: "Chase Checking → Ally Savings",
              transferId: transfer.id, status: "CLEARED", createdVia: "RECURRING",
            },
            {
              userId, accountId: accounts.savings.id, type: "TRANSFER_IN", direction: 1,
              amountMinor: cents(amount), currency: "USD",
              baseAmountMinor: cents(amount), baseCurrency: "USD",
              occurredAt: when, description: "Chase Checking → Ally Savings",
              transferId: transfer.id, status: "CLEARED", createdVia: "RECURRING",
            },
          );
        }
      }

      // ---- card payment --------------------------------------------------
      const payWhen = utc(year, month, Math.min(daysInMonth, 15), 9);
      if (payWhen <= today) {
        // Pay most of last month's statement — a card balance that drifts
        // positive is not a state a real card can be in.
        const amount = Math.round(amexChargesLastMonth * between(0.82, 0.94));
        const transfer = (await db.insert(t.transfers).values({
            userId, kind: "CREDIT_CARD_PAYMENT",
            fromAccountId: accounts.checking.id, toAccountId: accounts.amex.id,
            fromAmountMinor: cents(amount), fromCurrency: "USD",
            toAmountMinor: cents(amount), toCurrency: "USD",
            occurredAt: payWhen, note: "Amex Gold payment",
          }).returning({ id: t.transfers.id }))[0]!;
        rows.push(
          {
            userId, accountId: accounts.checking.id, type: "CREDIT_CARD_PAYMENT", direction: -1,
            amountMinor: cents(amount), currency: "USD",
            baseAmountMinor: cents(amount), baseCurrency: "USD",
            occurredAt: payWhen, description: "Payment to Amex Gold",
            transferId: transfer.id, status: "CLEARED", createdVia: "MANUAL",
          },
          {
            userId, accountId: accounts.amex.id, type: "CREDIT_CARD_RECEIPT", direction: 1,
            amountMinor: cents(amount), currency: "USD",
            baseAmountMinor: cents(amount), baseCurrency: "USD",
            occurredAt: payWhen, description: "Payment received",
            transferId: transfer.id, status: "CLEARED", createdVia: "MANUAL",
          },
        );
      }

      // ---- brokerage contribution + growth ---------------------------------
      {
        const contribution = Math.round(between(500, 950) / 50) * 50;
        pushIfPast(rows, today, {
          userId, accountId: accounts.brokerage.id, type: "DEPOSIT", direction: 1,
          amountMinor: cents(contribution), currency: "USD",
          baseAmountMinor: cents(contribution), baseCurrency: "USD",
          occurredAt: utc(year, month, 10, 15),
          description: "Brokerage contribution", status: "CLEARED", createdVia: "MANUAL",
        });
      }
      const dividend = Number(between(28, 96).toFixed(2));
      pushIfPast(rows, today, {
        userId, accountId: accounts.brokerage.id, type: "DIVIDEND", direction: 1,
        amountMinor: cents(dividend), currency: "USD",
        baseAmountMinor: cents(dividend), baseCurrency: "USD",
        occurredAt: utc(year, month, 18, 16),
        categoryId: categories.get("Dividends"), description: "Dividends",
        status: "CLEARED", createdVia: "SYSTEM",
      });

      // ---- cash withdrawal and spend ----------------------------------------
      if (random() > 0.5) {
        const amount = 100;
        const when = utc(year, month, Math.floor(between(4, 24)), 13);
        if (when <= today) {
          const transfer = (await db.insert(t.transfers).values({
              userId, kind: "TRANSFER",
              fromAccountId: accounts.checking.id, toAccountId: accounts.cash.id,
              fromAmountMinor: cents(amount), fromCurrency: "USD",
              toAmountMinor: cents(amount), toCurrency: "USD",
              occurredAt: when, note: "ATM withdrawal",
            }).returning({ id: t.transfers.id }))[0]!;
          rows.push(
            {
              userId, accountId: accounts.checking.id, type: "TRANSFER_OUT", direction: -1,
              amountMinor: cents(amount), currency: "USD",
              baseAmountMinor: cents(amount), baseCurrency: "USD",
              occurredAt: when, description: "ATM withdrawal",
              transferId: transfer.id, status: "CLEARED", createdVia: "MANUAL",
            },
            {
              userId, accountId: accounts.cash.id, type: "TRANSFER_IN", direction: 1,
              amountMinor: cents(amount), currency: "USD",
              baseAmountMinor: cents(amount), baseCurrency: "USD",
              occurredAt: when, description: "ATM withdrawal",
              transferId: transfer.id, status: "CLEARED", createdVia: "MANUAL",
            },
          );
          const spent = Number(between(20, 85).toFixed(2));
          pushIfPast(rows, today, {
            userId, accountId: accounts.cash.id, type: "EXPENSE", direction: -1,
            amountMinor: cents(spent), currency: "USD",
            baseAmountMinor: cents(spent), baseCurrency: "USD",
            occurredAt: new Date(when.getTime() + 2 * 86_400_000),
            categoryId: categories.get("Farmers market"), description: "Farmers market",
            status: "CLEARED", createdVia: "MANUAL",
          });
        }
      }

      amexChargesLastMonth = amexCharges + 19.99 + 9.99 + 59.99;

      // ---- savings interest -----------------------------------------------
      const interest = Number(between(4, 13).toFixed(2));
      pushIfPast(rows, today, {
        userId, accountId: accounts.savings.id, type: "INTEREST", direction: 1,
        amountMinor: cents(interest), currency: "USD",
        baseAmountMinor: cents(interest), baseCurrency: "USD",
        occurredAt: utc(year, month, daysInMonth, 23),
        categoryId: categories.get("Interest"), description: "Interest earned",
        status: "CLEARED", createdVia: "SYSTEM",
      });
    }
  }

  // ---- deliberate edge cases the UI and detectors must handle ----------
  const recent = (daysAgo: number, hour = 12) =>
    new Date(today.getTime() - daysAgo * 86_400_000 + (hour - 12) * 3_600_000);

  // A pending charge.
  rows.push({
    userId, accountId: accounts.amex.id, type: "EXPENSE", direction: -1,
    amountMinor: cents(18.4), currency: "USD",
    baseAmountMinor: cents(18.4), baseCurrency: "USD",
    occurredAt: recent(0, 8), categoryId: categories.get("Rideshare"),
    merchantId: merchants.get("Uber"), description: "Uber", rawDescriptor: "UBER *TRIP",
    status: "PENDING", createdVia: "IMPORT",
  });

  // A cross-currency charge on the EUR account.
  rows.push({
    userId, accountId: accounts.revolut.id, type: "EXPENSE", direction: -1,
    amountMinor: cents(42.6), currency: "EUR",
    accountAmountMinor: cents(42.6), fxRate: "1.082100000000",
    baseAmountMinor: cents(46.1), baseCurrency: "USD",
    occurredAt: recent(9), categoryId: categories.get("Restaurants"),
    description: "Café de Flore · Paris", status: "CLEARED", createdVia: "MANUAL",
  });

  // An anomaly: ~7× the usual Amazon spend.
  rows.push({
    userId, accountId: accounts.amex.id, type: "EXPENSE", direction: -1,
    amountMinor: cents(842), currency: "USD",
    baseAmountMinor: cents(842), baseCurrency: "USD",
    occurredAt: recent(3), categoryId: categories.get("Electronics"),
    merchantId: merchants.get("Amazon"), description: "Amazon", rawDescriptor: "AMZN MKTP US*2K41Z",
    status: "CLEARED", createdVia: "IMPORT",
  });

  // Two uncategorised rows for the review queue.
  for (const [descriptor, amount, days] of [["SQ *UNKNOWN VENDOR 8821", 34.5, 2], ["POS PURCHASE 4417", 12.99, 5]] as const) {
    rows.push({
      userId, accountId: accounts.checking.id, type: "EXPENSE", direction: -1,
      amountMinor: cents(amount), currency: "USD",
      baseAmountMinor: cents(amount), baseCurrency: "USD",
      occurredAt: recent(days), rawDescriptor: descriptor, description: descriptor,
      status: "CLEARED", createdVia: "IMPORT", needsReview: true,
    });
  }

  console.log(`  writing ${rows.length.toLocaleString()} transactions…`);
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(t.transactions).values(rows.slice(i, i + 1000) as never);
  }

  // A refund that reverses a real expense, and a three-way split.
  const nikeExpense = await db.query.transactions.findFirst({
    where: and(
      eq(t.transactions.userId, userId),
      eq(t.transactions.categoryId, categories.get("Clothing")!),
      eq(t.transactions.type, "EXPENSE"),
    ),
    orderBy: [desc(t.transactions.occurredAt)],
    columns: { id: true, amountMinor: true, categoryId: true, accountId: true },
  });
  if (nikeExpense) {
    await db.insert(t.transactions).values({
        userId, accountId: nikeExpense.accountId, type: "REFUND", direction: 1,
        amountMinor: nikeExpense.amountMinor, currency: "USD",
        baseAmountMinor: nikeExpense.amountMinor, baseCurrency: "USD",
        occurredAt: recent(1), categoryId: nikeExpense.categoryId,
        description: "Refund · Uniqlo", reversesTransactionId: nikeExpense.id,
        status: "CLEARED", createdVia: "MANUAL",
      });
  }

  const dinner = (await db.insert(t.transactions).values({
      userId, accountId: accounts.amex.id, type: "EXPENSE", direction: -1,
      amountMinor: cents(270), currency: "USD",
      baseAmountMinor: cents(270), baseCurrency: "USD",
      occurredAt: recent(2, 19), categoryId: categories.get("Restaurants"),
      merchantId: merchants.get("Lilia"), description: "Lilia", rawDescriptor: "TST* LILIA",
      status: "CLEARED", createdVia: "MANUAL", isSplit: true,
      note: "Anniversary dinner, split three ways",
    }).returning({ id: t.transactions.id }))[0]!;

  await db.insert(t.transactionSplits).values([
    { transactionId: dinner.id, categoryId: categories.get("Restaurants"), amountMinor: cents(90), baseAmountMinor: cents(90), sortOrder: 0 },
    { transactionId: dinner.id, categoryId: categories.get("Restaurants"), amountMinor: cents(90), baseAmountMinor: cents(90), owedByLabel: "Ayesha R.", sortOrder: 1 },
    { transactionId: dinner.id, categoryId: categories.get("Restaurants"), amountMinor: cents(90), baseAmountMinor: cents(90), owedByLabel: "Tomas K.", settledAt: recent(1), sortOrder: 2 },
  ]);
  await db.insert(t.transactionTags).values([
      { transactionId: dinner.id, tagId: tags[2].id },
      { transactionId: dinner.id, tagId: tags[0].id },
    ]);
}

function pushIfPast(rows: Array<Record<string, unknown>>, today: Date, row: Record<string, unknown>) {
  if ((row.occurredAt as Date) <= today) rows.push(row);
}

/* ------------------------------------------------------------- planning */

async function seedPlanning(
  userId: string,
  accounts: Accounts,
  categories: Map<string, string>,
  merchants: Map<string, string>,
) {
  const today = new Date();

  const budget = (await db.insert(t.budgets).values({
      userId, name: "Monthly budget", period: "MONTHLY", currency: "USD",
      totalLimitMinor: cents(5200), rollover: true, alertThresholds: [80, 100],
      visibility: "HOUSEHOLD",
    }).returning({ id: t.budgets.id }))[0]!;

  // [category, limit, rollover, fixed] — a fixed line is a lump-sum cost whose
  // pace marker would be meaningless. See domain/budget.ts.
  const budgetLines = (
    [
      ["Restaurants", 320, true, false],
      ["Supermarket", 600, false, false],
      ["Rent", 1650, false, true],
      ["Rideshare", 220, false, false],
      ["Electricity", 180, false, false],
      ["Streaming", 150, false, true],
      ["Pharmacy", 200, true, false],
      ["Clothing", 300, false, false],
      ["Cosmetics", 100, false, false],
      ["Fitness", 240, false, true],
    ] as Array<[string, number, boolean, boolean]>
  )
    .map(([name, limit, rollover, fixed]) => ({
      budgetId: budget.id,
      categoryId: categories.get(name)!,
      limitMinor: cents(limit),
      rollover,
      fixed,
      rolloverMinor: rollover ? cents(40) : 0n,
    }))
    .filter((c) => c.categoryId);

  if (budgetLines.length) await db.insert(t.budgetCategories).values(budgetLines);

  // Goals, funded by real contributions so "saved" reconciles.
  const japan = (await db.insert(t.goals).values({
      userId, name: "Japan, spring 2026", targetMinor: cents(6000), currency: "USD",
      targetDate: utc(2026, 2, 12), linkedAccountId: accounts.savings.id,
      contributionMinor: cents(400), contributionFreq: "MONTHLY",
      colorIndex: 11, icon: "flag",
    }).returning({ id: t.goals.id }))[0]!;

  await db.insert(t.goalMilestones).values([
    { goalId: japan.id, name: "Flights", amountMinor: cents(1200), sortOrder: 0, reachedAt: utc(2025, 3, 1) },
    { goalId: japan.id, name: "Rail pass", amountMinor: cents(600), sortOrder: 1, reachedAt: utc(2025, 5, 1) },
    { goalId: japan.id, name: "Lodging", amountMinor: cents(2400), sortOrder: 2 },
    { goalId: japan.id, name: "Spending money", amountMinor: cents(1800), sortOrder: 3 },
  ]);
  for (let i = 0; i < 9; i++) {
    const when = new Date(today.getTime() - (9 - i) * 30 * 86_400_000);
    await db.insert(t.goalContributions).values({ goalId: japan.id, amountMinor: cents(i === 2 ? 640 : 400), occurredAt: when });
  }

  const emergency = (await db.insert(t.goals).values({
      userId, name: "Emergency fund", targetMinor: cents(20_000), currency: "USD",
      linkedAccountId: accounts.savings.id, contributionMinor: cents(500),
      contributionFreq: "MONTHLY", colorIndex: 3, icon: "shield",
    }).returning({ id: t.goals.id }))[0]!;
  for (let i = 0; i < 24; i++) {
    await db.insert(t.goalContributions).values({
        goalId: emergency.id,
        amountMinor: cents(500 + Math.round(between(-120, 180))),
        occurredAt: new Date(today.getTime() - (24 - i) * 30 * 86_400_000),
      });
  }

  const laptop = (await db.insert(t.goals).values({
      userId, name: "New laptop", targetMinor: cents(2400), currency: "USD",
      targetDate: utc(today.getUTCFullYear(), today.getUTCMonth() + 5, 1),
      contributionMinor: cents(200), contributionFreq: "MONTHLY", colorIndex: 6, icon: "chart",
    }).returning())[0]!;

  await db.insert(t.goalContributions).values(
    Array.from({ length: 6 }, (_, i) => ({
      goalId: laptop.id,
      amountMinor: cents(200),
      occurredAt: new Date(today.getTime() - (6 - i) * 30 * 86_400_000),
    })),
  );

  // Debt with a real payment history.
  const autoDebt = (await db.insert(t.debts).values({
      userId, name: "Auto loan · Toyota", kind: "LOAN",
      principalMinor: cents(21_600), currentBalanceMinor: cents(12_240),
      currency: "USD", aprBps: 490, minimumPaymentMinor: cents(384.22),
      paymentDay: 24, termMonths: 60, startedOn: utc(2023, 4, 24),
      linkedAccountId: accounts.auto.id,
    }).returning({ id: t.debts.id }))[0]!;
  let balance = 21_600;
  for (let i = 0; i < 34; i++) {
    const interest = Number(((balance * 0.049) / 12).toFixed(2));
    const principal = Number((384.22 - interest).toFixed(2));
    balance = Number((balance - principal).toFixed(2));
    await db.insert(t.debtPayments).values({
        debtId: autoDebt.id,
        amountMinor: cents(384.22),
        principalMinor: cents(principal),
        interestMinor: cents(interest),
        balanceAfterMinor: cents(balance),
        occurredAt: new Date(today.getTime() - (34 - i) * 30 * 86_400_000),
      });
  }
  await db
    .update(t.debts)
    .set({ currentBalanceMinor: cents(balance) })
    .where(eq(t.debts.id, autoDebt.id));

  await db.insert(t.debts).values({
      userId, name: "Amex Gold balance", kind: "CREDIT_CARD",
      principalMinor: cents(2860.4), currentBalanceMinor: cents(2860.4),
      currency: "USD", aprBps: 2474, minimumPaymentMinor: cents(86),
      paymentDay: 2, startedOn: utc(2025, 0, 1), linkedAccountId: accounts.amex.id,
    });

  // Lending, including one written off.
  await db.insert(t.lendingRecords).values({
      userId, direction: "LENT", personName: "Ayesha Rahman", personEmail: "ayesha@example.com",
      principalMinor: cents(90), outstandingMinor: cents(90), currency: "USD",
      occurredAt: new Date(today.getTime() - 2 * 86_400_000),
      note: "Share of the Lilia dinner",
    });
  const dan = (await db.insert(t.lendingRecords).values({
      userId, direction: "LENT", personName: "Dan Marchetti",
      principalMinor: cents(220), outstandingMinor: cents(100), currency: "USD",
      occurredAt: new Date(today.getTime() - 46 * 86_400_000),
      status: "PARTIALLY_SETTLED", note: "Concert tickets",
    }).returning({ id: t.lendingRecords.id }))[0]!;
  await db.insert(t.lendingPayments).values({ lendingId: dan.id, amountMinor: cents(120), occurredAt: new Date(today.getTime() - 20 * 86_400_000), method: "Venmo" });
  await db.insert(t.lendingRecords).values({
      userId, direction: "LENT", personName: "Rafi Bhuiyan",
      principalMinor: cents(45), outstandingMinor: cents(45), currency: "USD",
      occurredAt: new Date(today.getTime() - 200 * 86_400_000),
      status: "WRITTEN_OFF", writtenOffAt: new Date(today.getTime() - 36 * 86_400_000),
      note: "Written off: uncollectable",
    });

  // Subscriptions, including two unused and one trial.
  for (const [name, price, cycle, category, accountId, startedDaysAgo, lastUsedDaysAgo, trialDays] of [
    ["Equinox", 215, "MONTHLY", "Fitness", accounts.checking.id, 700, 4, null],
    ["Adobe Creative Cloud", 59.99, "MONTHLY", "Streaming", accounts.amex.id, 620, 2, null],
    ["Spotify Family", 19.99, "MONTHLY", "Streaming", accounts.amex.id, 900, 92, null],
    ["iCloud+ 2TB", 9.99, "MONTHLY", "Streaming", accounts.amex.id, 1100, 1, null],
    ["New York Times", 204, "ANNUAL", "Books", accounts.amex.id, 400, 6, null],
    ["Dropbox Plus", 119.88, "ANNUAL", "Household", accounts.freedom.id, 800, 94, null],
    ["Headspace", 12.99, "MONTHLY", "Fitness", accounts.amex.id, 500, 71, null],
    ["Notion AI", 10, "MONTHLY", "Household", accounts.amex.id, 11, null, 3],
    ["Figma Professional", 15, "MONTHLY", "Household", accounts.freedom.id, 5, null, 9],
  ] as const) {
    await db.insert(t.subscriptions).values({
        userId, name, accountId,
        merchantId: merchants.get(name) ?? null,
        categoryId: categories.get(category) ?? null,
        priceMinor: cents(price), currency: "USD",
        cycle: cycle as never, cycleCount: 1,
        startedOn: new Date(today.getTime() - startedDaysAgo * 86_400_000),
        trialEndsOn: trialDays ? new Date(today.getTime() + trialDays * 86_400_000) : null,
        renewsOn: new Date(today.getTime() + Math.round(between(2, 28)) * 86_400_000),
        status: trialDays ? "TRIAL" : "ACTIVE",
        lastUsedAt: lastUsedDaysAgo !== null ? new Date(today.getTime() - lastUsedDaysAgo * 86_400_000) : null,
      });
  }

  // Bills, with one overdue.
  for (const [name, amount, dueOffset, category, mode, status] of [
    ["Rent · 214 Bergen St", 1650, 2, "Rent", "FIXED", "SCHEDULED"],
    ["Con Edison", 112, 5, "Electricity", "VARIABLE", "SCHEDULED"],
    ["Verizon Fios", 89.99, -5, "Internet", "FIXED", "OVERDUE"],
    ["T-Mobile", 65, 11, "Phone", "FIXED", "SCHEDULED"],
    ["Renters insurance", 18.5, 8, "Insurance", "FIXED", "SCHEDULED"],
  ] as const) {
    const recurring = (await db.insert(t.recurringTransactions).values({
        userId, name, type: "EXPENSE", accountId: accounts.checking.id,
        categoryId: categories.get(category) ?? null,
        amountMode: mode as never, amountMinor: cents(amount), currency: "USD",
        frequency: "MONTHLY",
        byMonthDay: Math.max(1, Math.min(28, today.getUTCDate() + dueOffset)),
        startsOn: utc(today.getUTCFullYear() - 1, 0, 1),
        autoCreate: false, reminder: true, reminderDaysBefore: 3,
      }).returning({ id: t.recurringTransactions.id }))[0]!;

    const bill = (await db.insert(t.bills).values({
        userId, name, accountId: accounts.checking.id,
        categoryId: categories.get(category) ?? null,
        recurringId: recurring.id,
        amountMode: mode as never, amountMinor: cents(amount), currency: "USD",
        dueDay: Math.max(1, Math.min(28, today.getUTCDate() + dueOffset)),
        reminderDaysBefore: 3,
      }).returning({ id: t.bills.id }))[0]!;

    // Paid history plus the current occurrence.
    for (let i = 6; i >= 1; i--) {
      await db.insert(t.billOccurrences).values({
          billId: bill.id,
          dueOn: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, Math.min(28, today.getUTCDate()))),
          expectedMinor: cents(amount),
          paidMinor: cents(mode === "VARIABLE" ? Number((amount * between(0.8, 1.35)).toFixed(2)) : amount),
          status: "PAID",
          paidAt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, Math.min(28, today.getUTCDate()))),
        });
    }
    await db.insert(t.billOccurrences).values({
        billId: bill.id,
        dueOn: new Date(today.getTime() + dueOffset * 86_400_000),
        expectedMinor: cents(amount),
        status: status as never,
      });
  }

  // Active recurring schedules the job will materialise.
  for (const [name, type, amount, frequency, day, accountId, categoryName] of [
    ["Northwind Labs payroll", "INCOME", 3210, "MONTHLY", 30, accounts.checking.id, "Salary"],
    ["Cleaning service", "EXPENSE", 140, "BIWEEKLY", null, accounts.checking.id, "Home maintenance"],
  ] as const) {
    const startsOn = utc(today.getUTCFullYear() - 1, 0, 1);
    const spec = {
      frequency: frequency as never,
      interval: 1,
      startsOn,
      byMonthDay: day,
      byWeekday: day ? null : 4,
    };

    // `startsOn` is deliberately historical — this is a schedule the user has
    // been running for over a year. So the seed has to say where the engine
    // left off, or the first job run treats that whole history as work due
    // today and posts a year of back-dated payroll.
    const past = occurrences(spec, { from: startsOn, to: today, limit: 500 });
    const lastRunOn = past.at(-1) ?? null;

    await db.insert(t.recurringTransactions).values({
        userId, name, type: type as never, accountId,
        categoryId: categories.get(categoryName) ?? null,
        amountMode: "FIXED", amountMinor: cents(amount), currency: "USD",
        frequency: frequency as never,
        byMonthDay: day, byWeekday: day ? null : 4,
        startsOn,
        autoCreate: true, reminder: true,
        lastRunOn,
        nextDueOn: nextOccurrence(spec, lastRunOn ?? today),
      });
  }

  // Two paused schedules, for the paused section.
  for (const [name, amount] of [["Storage unit", 85], ["Language tutor", 60]] as const) {
    await db.insert(t.recurringTransactions).values({
        userId, name, type: "EXPENSE", accountId: accounts.checking.id,
        amountMode: "FIXED", amountMinor: cents(amount), currency: "USD",
        frequency: "MONTHLY", byMonthDay: 5,
        startsOn: utc(today.getUTCFullYear() - 1, 0, 1),
        status: "PAUSED", pausedAt: new Date(today.getTime() - 30 * 86_400_000),
      });
  }

  return budget;
}

/* ---------------------------------------------------------- operational */

async function seedOperational(userId: string, accounts: Accounts, categories: Map<string, string>) {
  const today = new Date();

  await db.insert(t.financialRules).values([
      {
        userId, name: "Whole Foods → Supermarket", priority: 10,
        conditions: [{ field: "description", operator: "contains", value: "WHOLEFDS" }],
        actions: [{ action: "set_category", value: categories.get("Supermarket") }],
        appliedCount: 68, lastAppliedAt: new Date(today.getTime() - 86_400_000),
      },
      {
        userId, name: "Large charges need review", priority: 20,
        conditions: [{ field: "amount", operator: "gt", value: 500 }],
        actions: [{ action: "flag_review", value: true }],
        appliedCount: 14,
      },
      {
        userId, name: "Business meals are deductible", priority: 30, enabled: false,
        conditions: [{ field: "description", operator: "contains", value: "client" }],
        actions: [{ action: "add_tag", value: "deductible" }],
        appliedCount: 9,
      },
    ] as never);

  await db.insert(t.reconciliations).values({
      userId, accountId: accounts.checking.id,
      statementDate: utc(today.getUTCFullYear(), today.getUTCMonth() - 1, 2),
      recordedMinor: cents(7840.12), actualMinor: cents(7840.12),
      differenceMinor: 0n, status: "BALANCED",
      closedAt: utc(today.getUTCFullYear(), today.getUTCMonth() - 1, 2),
    });

  await db.insert(t.notifications).values([
      {
        userId, kind: "BILL_OVERDUE", severity: "CRITICAL",
        title: "Verizon Fios is overdue",
        body: "Due 5 days ago · $89.99",
        dedupeKey: "seed-bill-overdue",
        data: { billName: "Verizon Fios" },
      },
      {
        userId, kind: "BUDGET_EXCEEDED", severity: "WARNING",
        title: "Restaurants is over budget",
        body: "Spent more than the $280.00 limit this month",
        dedupeKey: "seed-budget-exceeded",
      },
      {
        userId, kind: "UNUSUAL_TRANSACTION", severity: "WARNING",
        title: "Unusual charge detected",
        body: "$842.00 at Amazon — about 7× your typical spend there",
        dedupeKey: "seed-anomaly",
      },
      {
        userId, kind: "NEW_SIGN_IN", severity: "INFO",
        title: "New sign-in", body: "Chrome on Windows · New York, US",
        dedupeKey: "seed-signin", readAt: new Date(),
      },
    ] as never);

  await db.insert(t.auditLogs).values([
      {
        userId, actorType: "USER", actorId: userId, actorLabel: "Miftaul Islam",
        action: "transaction.create", entityType: "Transaction", entityId: "seed-1",
        after: { amountMinor: "27000", currency: "USD" },
      },
      {
        userId, actorType: "RULE", actorId: userId, actorLabel: "System · rule",
        action: "transaction.update", entityType: "Transaction", entityId: "seed-1",
        before: { categoryId: null }, after: { categoryId: categories.get("Restaurants") },
      },
    ] as never);
}

/* --------------------------------------------------------- other users */

async function seedNewUser() {
  console.log("Seeding qa.new@spendtrack.test…");
  const user = await createUser("qa.new@spendtrack.test", "Nadia Karim");
  await seedCategories(user.id);
  // Deliberately no accounts, no transactions: this account exists to exercise
  // every empty state and the onboarding flow.
  await db
    .update(t.userSettings)
    .set({ onboardingCompletedAt: null, onboardingStep: 0 })
    .where(eq(t.userSettings.userId, user.id));
}

async function seedMember(householdId: string) {
  console.log("Seeding qa.member@spendtrack.test…");
  const user = await createUser("qa.member@spendtrack.test", "Zaid Islam");
  const categories = await seedCategories(user.id);

  await db.insert(t.householdMembers).values({ householdId, userId: user.id, role: "MEMBER" });

  const account = (await db.insert(t.accounts).values({
      userId: user.id, name: "Personal Checking", type: "CHECKING", currency: "USD",
      openingBalanceMinor: cents(1200), isDefault: true,
    }).returning({ id: t.accounts.id }))[0]!;

  const today = new Date();
  await db.insert(t.transactions).values(Array.from({ length: 24 }, (_, i) => {
      const merchant = pick(MERCHANTS);
      const amount = Number(between(merchant.min, merchant.max).toFixed(2));
      return {
        userId: user.id, accountId: account.id, type: "EXPENSE" as const, direction: -1,
        amountMinor: cents(amount), currency: "USD",
        baseAmountMinor: cents(amount), baseCurrency: "USD",
        occurredAt: new Date(today.getTime() - i * 3 * 86_400_000),
        categoryId: categories.get(merchant.category) ?? null,
        description: merchant.name, status: "CLEARED" as const, createdVia: "MANUAL" as const,
      };
    }));

  await refreshBalances(user.id);
}

async function seedAdmin() {
  console.log("Seeding qa.admin@spendtrack.test…");
  const user = await createUser("qa.admin@spendtrack.test", "Platform Admin");
  await seedCategories(user.id);

  await db.insert(t.adminUsers).values({ userId: user.id, role: "SUPER_ADMIN", mfaEnabled: false, lastSeenAt: new Date() });

  await db.insert(t.featureFlags).values([
      { key: "ai_agent_beta", description: "Multi-step AI agent", enabled: true, rolloutPercent: 5 },
      { key: "receipt_ocr", description: "Receipt extraction pipeline", enabled: true, rolloutPercent: 100 },
      { key: "household_sharing", description: "Shared household finance", enabled: true, rolloutPercent: 100 },
      { key: "web_push", description: "Web push notifications", enabled: false, rolloutPercent: 0 },
    ]);

  await db.insert(t.systemConfig).values([
      { key: "ai.max_requests_per_minute", value: 30 },
      { key: "upload.max_bytes", value: 10_485_760 },
      { key: "retention.soft_delete_days", value: 30 },
    ] as never);

  // Job history, so the admin System page has something real to render.
  const jobs = [
    ["recurring-materialise", 0], ["bill-reminders", 0], ["budget-alerts", 0],
    ["exchange-rate-sync", 2], ["anomaly-scan", 1], ["receipt-ocr-queue", 0],
  ] as const;
  const events: Array<Record<string, unknown>> = [];
  for (const [job, failures] of jobs) {
    for (let i = 0; i < 24; i++) {
      const failed = i < failures;
      events.push({
        kind: "JOB_RUN",
        severity: failed ? "ERROR" : "INFO",
        source: job,
        message: failed ? "Upstream returned 503" : "Completed",
        fingerprint: failed ? `${job}:upstream-503` : `${job}:ok`,
        durationMs: Math.round(between(40, 2400)),
        createdAt: new Date(Date.now() - i * 3_600_000),
      });
    }
  }
  events.push(
    {
      kind: "ERROR", severity: "WARNING", source: "POST /api/transactions",
      message: "ZodValidationError: amountMinor expected integer",
      fingerprint: "api:zod:amountMinor", createdAt: new Date(Date.now() - 720_000),
    },
    {
      kind: "RATE_LIMIT", severity: "INFO", source: "POST /api/ai/chat",
      message: "Rate limit reached for user", fingerprint: "ratelimit:ai-chat",
      createdAt: new Date(Date.now() - 360_000),
    },
  );
  await db.insert(t.systemEvents).values(events as never);
}

/** Recompute every cached balance from the ledger — the same SQL the app uses. */
async function refreshBalances(userId: string) {
  // A correlated subquery rather than UPDATE…FROM: the join form silently skips
  // accounts with no transactions, leaving their opening balance unapplied.
  await db.execute(sql`
    UPDATE accounts a
    SET "cachedBalanceMinor" = COALESCE(a."openingBalanceMinor", 0) + COALESCE((
          SELECT SUM(t."amountMinor" * t.direction)::bigint
          FROM transactions t
          WHERE t."accountId" = a.id
            AND t."deletedAt" IS NULL
            AND t.status <> 'VOID'
        ), 0),
        "cachedBalanceAt" = now()
    WHERE a."userId" = ${userId}
  `);
}

async function seedExchangeRates() {
  console.log("Seeding exchange rates…");
  const rates: Record<string, number> = {
    EUR: 0.9241, GBP: 0.7854, JPY: 147.62, CAD: 1.3521, AUD: 1.4982,
    CHF: 0.8612, CNY: 7.1204, INR: 83.412, BDT: 119.84, SGD: 1.2894,
  };
  const rows: Array<Record<string, unknown>> = [];
  const today = new Date();

  // 400 days of history, so date-specific conversion has something to find.
  for (let d = 0; d < 400; d++) {
    const asOf = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - d));
    for (const [quote, base] of Object.entries(rates)) {
      const drift = 1 + Math.sin(d / 40) * 0.03 + (random() - 0.5) * 0.004;
      rows.push({
        base: "USD",
        quote,
        rate: (base * drift).toFixed(12),
        asOf,
        source: "seed",
      });
    }
  }
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(t.exchangeRates).values(rows.slice(i, i + 1000) as never).onConflictDoNothing();
  }
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
