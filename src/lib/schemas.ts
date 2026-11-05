/**
 * Zod schemas — the single definition of what valid input looks like.
 *
 * These are shared by Route Handlers, Server Actions, AI tools and tests, so a
 * field can never be validated one way through the UI and another way through
 * the assistant.
 */

import * as z from "zod";
import { exponentOf, parseAmount } from "@/src/domain/money";

/* ------------------------------------------------------------- primitives */

export const cuid = z.string().min(1).max(64);
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code like USD.");

/** Amount parsing that knows the currency — used where the currency is present. */
export function parseAmountForCurrency(
  value: string | number | bigint,
  currency: string,
  locale?: string,
): bigint {
  if (typeof value === "bigint") return value;
  const asString =
    typeof value === "number" ? value.toFixed(exponentOf(currency)) : value;
  return parseAmount(asString, currency, { locale }).minor;
}

export const isoDate = z.union([z.string(), z.date()]).transform((v, ctx) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "That isn't a valid date." });
    return z.NEVER;
  }
  return d;
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ------------------------------------------------------------------ enums */

export const accountTypeSchema = z.enum([
  "CASH", "CHECKING", "SAVINGS", "CREDIT_CARD", "DEBIT_CARD", "PREPAID",
  "DIGITAL_WALLET", "INVESTMENT", "LOAN", "LIABILITY", "OTHER",
]);

export const transactionTypeSchema = z.enum([
  "EXPENSE", "INCOME", "TRANSFER_OUT", "TRANSFER_IN", "CREDIT_CARD_PAYMENT",
  "CREDIT_CARD_RECEIPT", "REFUND", "REIMBURSEMENT", "DEPOSIT", "WITHDRAWAL",
  "ADJUSTMENT", "DEBT_PAYMENT", "LENDING_OUT", "LENDING_REPAYMENT_IN",
  "BORROWING_IN", "BORROWING_REPAYMENT_OUT", "GOAL_CONTRIBUTION", "FEE",
  "INTEREST", "DIVIDEND",
]);

export const transactionStatusSchema = z.enum(["PENDING", "CLEARED", "RECONCILED", "VOID"]);
export const frequencySchema = z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM_DAYS"]);
export const weekendPolicySchema = z.enum(["KEEP", "PREVIOUS_WEEKDAY", "NEXT_WEEKDAY"]);
export const budgetPeriodSchema = z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]);
export const billingCycleSchema = z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "CUSTOM"]);
export const visibilitySchema = z.enum(["PRIVATE", "HOUSEHOLD"]);
export const categoryKindSchema = z.enum(["EXPENSE", "INCOME", "TRANSFER"]);

/* --------------------------------------------------------------- accounts */

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(80),
  type: accountTypeSchema,
  currency: currencyCode,
  institution: z.string().trim().max(80).optional(),
  mask: z.string().trim().regex(/^\d{2,4}$/, "Use the last 2–4 digits.").optional(),
  openingBalance: z.string().default("0"),
  colorIndex: z.number().int().min(1).max(12).default(12),
  icon: z.string().max(32).optional(),
  creditLimit: z.string().optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
  paymentDueDay: z.number().int().min(1).max(31).optional(),
  aprBps: z.number().int().min(0).max(100_000).optional(),
  interestRateBps: z.number().int().min(0).max(100_000).optional(),
  visibility: visibilitySchema.default("PRIVATE"),
  excludeFromNetWorth: z.boolean().default(false),
});

export const updateAccountSchema = createAccountSchema
  .partial()
  // Changing the currency after transactions exist would silently reinterpret
  // every amount on the account.
  .omit({ currency: true, openingBalance: true })
  .extend({ sortOrder: z.number().int().optional() });

/* ----------------------------------------------------------- transactions */

export const splitSchema = z.object({
  categoryId: cuid.nullable().optional(),
  amount: z.string(),
  note: z.string().trim().max(200).optional(),
  owedByLabel: z.string().trim().max(80).optional(),
});

export const createTransactionSchema = z.object({
  accountId: cuid,
  type: transactionTypeSchema.default("EXPENSE"),
  amount: z.string().min(1, "Enter an amount."),
  currency: currencyCode.optional(),
  occurredAt: isoDate.default(() => new Date()),
  categoryId: cuid.nullable().optional(),
  merchantId: cuid.nullable().optional(),
  merchantName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  status: transactionStatusSchema.default("CLEARED"),
  tagIds: z.array(cuid).max(20).default([]),
  tagNames: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  splits: z.array(splitSchema).max(50).optional(),
  locationLabel: z.string().trim().max(120).optional(),
  externalRef: z.string().trim().max(120).optional(),
  reversesTransactionId: cuid.optional(),
  excludeFromBudget: z.boolean().default(false),
  attachmentIds: z.array(cuid).max(10).default([]),
});

export const updateTransactionSchema = createTransactionSchema
  .partial()
  .omit({ accountId: true })
  .extend({ accountId: cuid.optional(), needsReview: z.boolean().optional() });

export const transactionFilterSchema = z.object({
  accountIds: z.array(cuid).optional(),
  categoryIds: z.array(cuid).optional(),
  merchantIds: z.array(cuid).optional(),
  tagIds: z.array(cuid).optional(),
  types: z.array(transactionTypeSchema).optional(),
  statuses: z.array(transactionStatusSchema).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  uncategorised: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  includeTransfers: z.boolean().default(true),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
}).merge(paginationSchema);

/* -------------------------------------------------------------- transfers */

export const createTransferSchema = z
  .object({
    fromAccountId: cuid,
    toAccountId: cuid,
    amount: z.string().min(1, "Enter an amount."),
    /** Set only for a cross-currency transfer. */
    toAmount: z.string().optional(),
    fee: z.string().optional(),
    occurredAt: isoDate.default(() => new Date()),
    note: z.string().trim().max(2000).optional(),
    goalId: cuid.optional(),
    debtId: cuid.optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Pick two different accounts.",
    path: ["toAccountId"],
  });

/* ------------------------------------------------------------- categories */

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: categoryKindSchema.default("EXPENSE"),
  parentId: cuid.nullable().optional(),
  colorIndex: z.number().int().min(1).max(12).default(12),
  icon: z.string().max(32).default("tag"),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  sortOrder: z.number().int().optional(),
});

/* ----------------------------------------------------------------- budget */

export const budgetCategoryLineSchema = z.object({
  categoryId: cuid,
  limit: z.string().min(1),
  rollover: z.boolean().default(false),
  /** Rent, insurance, a loan payment — judged on the limit, not on pace. */
  fixed: z.boolean().default(false),
});

export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    period: budgetPeriodSchema.default("MONTHLY"),
    currency: currencyCode,
    totalLimit: z.string().optional(),
    startsOn: isoDate.optional(),
    endsOn: isoDate.optional(),
    rollover: z.boolean().default(false),
    alertThresholds: z.array(z.number().int().min(1).max(500)).max(5).default([80, 100]),
    visibility: visibilitySchema.default("PRIVATE"),
    categories: z.array(budgetCategoryLineSchema).max(100).default([]),
  })
  .refine((v) => v.period !== "CUSTOM" || (v.startsOn && v.endsOn), {
    message: "A custom budget needs a start and an end date.",
    path: ["startsOn"],
  })
  .refine((v) => Boolean(v.totalLimit) || v.categories.length > 0, {
    message: "Set an overall limit or at least one category limit.",
    path: ["totalLimit"],
  });

export const updateBudgetSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  totalLimit: z.string().nullable().optional(),
  rollover: z.boolean().optional(),
  alertThresholds: z.array(z.number().int().min(1).max(500)).max(5).optional(),
  visibility: visibilitySchema.optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  categories: z.array(budgetCategoryLineSchema).max(100).optional(),
});

/* ------------------------------------------------------------------ goals */

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  target: z.string().min(1),
  currency: currencyCode,
  targetDate: isoDate.optional(),
  linkedAccountId: cuid.optional(),
  contribution: z.string().optional(),
  contributionFreq: frequencySchema.optional(),
  colorIndex: z.number().int().min(1).max(12).default(11),
  icon: z.string().max(32).default("flag"),
  note: z.string().trim().max(500).optional(),
  milestones: z
    .array(z.object({ name: z.string().trim().min(1).max(60), amount: z.string().min(1) }))
    .max(20)
    .default([]),
});

export const updateGoalSchema = createGoalSchema.partial().omit({ currency: true }).extend({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]).optional(),
});

export const contributeToGoalSchema = z.object({
  goalId: cuid,
  amount: z.string().min(1),
  fromAccountId: cuid.optional(),
  occurredAt: isoDate.default(() => new Date()),
  note: z.string().trim().max(200).optional(),
});

/* -------------------------------------------------------- savings targets */

/**
 * A savings plan uses only the frequencies a person actually saves on — daily
 * and "every N days" make no sense for putting money aside, and allowing them
 * would put periods in the plan that no bank standing order can produce.
 */
export const savingsFrequencySchema = z.enum([
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);

/**
 * The planner. `contribution` and `by` are alternatives — give the amount you
 * can save and get a date, or give the date and get the amount. Both are
 * optional so the page can render a plan before either is filled in.
 */
export const previewSavingsPlanSchema = z.object({
  price: z.string().min(1),
  saved: z.string().optional(),
  contribution: z.string().optional(),
  by: isoDate.optional(),
  frequency: savingsFrequencySchema.optional(),
  currency: currencyCode.optional(),
});

export const createSavingsTargetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.string().min(1),
  contribution: z.string().min(1),
  frequency: savingsFrequencySchema.default("MONTHLY"),
  currency: currencyCode.optional(),
  linkedAccountId: cuid.nullable().optional(),
  colorIndex: z.number().int().min(1).max(12).default(6),
  icon: z.string().max(32).default("target"),
  note: z.string().trim().max(500).nullable().optional(),
});

export const depositToTargetSchema = z.object({
  targetId: cuid,
  amount: z.string().min(1),
  fromAccountId: cuid.optional(),
  occurredAt: isoDate.optional(),
  note: z.string().trim().max(200).optional(),
});

/* ------------------------------------------------------------------- debt */

export const createDebtSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["LOAN", "CREDIT_CARD", "MORTGAGE", "STUDENT_LOAN", "MEDICAL", "PERSONAL", "OTHER"]).default("LOAN"),
  principal: z.string().min(1),
  currentBalance: z.string().optional(),
  currency: currencyCode,
  aprBps: z.number().int().min(0).max(100_000),
  minimumPayment: z.string().min(1),
  paymentDay: z.number().int().min(1).max(31).optional(),
  termMonths: z.number().int().min(1).max(600).optional(),
  startedOn: isoDate.default(() => new Date()),
  linkedAccountId: cuid.optional(),
});

export const recordDebtPaymentSchema = z.object({
  debtId: cuid,
  amount: z.string().min(1),
  fromAccountId: cuid.optional(),
  occurredAt: isoDate.default(() => new Date()),
  note: z.string().trim().max(200).optional(),
});

/* ---------------------------------------------------------------- lending */

export const createLendingSchema = z.object({
  direction: z.enum(["LENT", "BORROWED"]),
  personName: z.string().trim().min(1).max(80),
  personEmail: z.email().optional().or(z.literal("")),
  principal: z.string().min(1),
  currency: currencyCode,
  accountId: cuid.optional(),
  occurredAt: isoDate.default(() => new Date()),
  dueOn: isoDate.optional(),
  note: z.string().trim().max(500).optional(),
});

export const recordLendingPaymentSchema = z.object({
  lendingId: cuid,
  amount: z.string().min(1),
  accountId: cuid.optional(),
  occurredAt: isoDate.default(() => new Date()),
  method: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

/* -------------------------------------------------------------- recurring */

/**
 * The field shape, separate from the cross-field rule.
 *
 * Zod v4 refuses `.partial()` on a refined schema — correctly, since a rule
 * about the relationship between two fields cannot be checked when both may be
 * absent. Keeping the shape and the rule separate means the update schema can
 * be derived from the shape without losing the rule on create.
 */
export const recurringShape = z.object({
  name: z.string().trim().min(1).max(80),
  type: transactionTypeSchema.default("EXPENSE"),
  accountId: cuid,
  toAccountId: cuid.optional(),
  categoryId: cuid.optional(),
  amountMode: z.enum(["FIXED", "VARIABLE"]).default("FIXED"),
  amount: z.string().optional(),
  currency: currencyCode,
  frequency: frequencySchema,
  interval: z.number().int().min(1).max(365).default(1),
  byWeekday: z.number().int().min(1).max(7).optional(),
  byMonthDay: z.number().int().min(1).max(31).optional(),
  byMonth: z.number().int().min(1).max(12).optional(),
  weekendPolicy: weekendPolicySchema.default("KEEP"),
  startsOn: isoDate,
  endsOn: isoDate.optional(),
  maxOccurrences: z.number().int().min(1).max(1000).optional(),
  leadDays: z.number().int().min(0).max(30).default(2),
  autoCreate: z.boolean().default(true),
  reminder: z.boolean().default(true),
  reminderDaysBefore: z.number().int().min(0).max(30).default(1),
  note: z.string().trim().max(500).optional(),
});

export const createRecurringSchema = recurringShape.refine(
  (v) => v.amountMode === "VARIABLE" || Boolean(v.amount),
  { message: "A fixed schedule needs an amount.", path: ["amount"] },
);

export const updateRecurringSchema = recurringShape.partial().extend({
  status: z.enum(["ACTIVE", "PAUSED", "ENDED"]).optional(),
});

/* ---------------------------------------------------- subscriptions/bills */

export const createSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  merchantId: cuid.optional(),
  categoryId: cuid.optional(),
  accountId: cuid,
  planName: z.string().trim().max(80).optional(),
  price: z.string().min(1),
  currency: currencyCode,
  cycle: billingCycleSchema,
  cycleCount: z.number().int().min(1).max(36).default(1),
  startedOn: isoDate.default(() => new Date()),
  trialEndsOn: isoDate.optional(),
  renewsOn: isoDate.optional(),
  websiteUrl: z.url().optional().or(z.literal("")),
  cancelUrl: z.url().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
  createRecurring: z.boolean().default(true),
});

export const updateSubscriptionSchema = createSubscriptionSchema.partial().extend({
  status: z.enum(["TRIAL", "ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
  cancelledOn: isoDate.optional(),
});

export const createBillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  accountId: cuid,
  categoryId: cuid.optional(),
  amountMode: z.enum(["FIXED", "VARIABLE"]).default("FIXED"),
  amount: z.string().optional(),
  currency: currencyCode,
  dueDay: z.number().int().min(1).max(31).optional(),
  frequency: frequencySchema.default("MONTHLY"),
  startsOn: isoDate.default(() => new Date()),
  autoPay: z.boolean().default(false),
  reminderDaysBefore: z.number().int().min(0).max(30).default(3),
  notes: z.string().trim().max(500).optional(),
});

export const payBillSchema = z.object({
  occurrenceId: cuid,
  amount: z.string().optional(),
  accountId: cuid.optional(),
  paidAt: isoDate.default(() => new Date()),
});

/* --------------------------------------------------------------- receipts */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
] as const;

export const linkReceiptSchema = z.object({
  receiptId: cuid,
  transactionId: cuid.optional(),
  createTransaction: z.boolean().default(false),
  accountId: cuid.optional(),
  categoryId: cuid.optional(),
});

/* ----------------------------------------------------------- reconcile/rules */

export const startReconciliationSchema = z.object({
  accountId: cuid,
  statementDate: isoDate,
  actualBalance: z.string().min(1),
});

export const closeReconciliationSchema = z.object({
  reconciliationId: cuid,
  clearedTransactionIds: z.array(cuid).max(5000),
  resolution: z.enum(["ADJUST", "CLOSE_WITH_VARIANCE", "ABANDON"]),
  note: z.string().trim().max(500).optional(),
});

export const ruleConditionSchema = z.object({
  field: z.enum(["merchant", "description", "amount", "account", "category", "weekday", "mcc"]),
  operator: z.enum([
    "contains", "equals", "starts_with", "ends_with", "regex",
    "gt", "gte", "lt", "lte", "between", "in",
  ]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

export const ruleActionSchema = z.object({
  action: z.enum([
    "set_category", "set_merchant", "add_tag", "flag_review",
    "notify", "exclude_from_budget", "set_note",
  ]),
  value: z.union([z.string(), z.boolean()]).optional(),
});

export const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(10_000).default(100),
  matchAll: z.boolean().default(true),
  stopOnMatch: z.boolean().default(false),
  conditions: z.array(ruleConditionSchema).min(1, "Add at least one condition.").max(10),
  actions: z.array(ruleActionSchema).min(1, "Add at least one action.").max(10),
  applyToHistory: z.boolean().default(false),
});

/* ----------------------------------------------------------------- import */

export const importMappingSchema = z.object({
  importJobId: cuid,
  accountId: cuid,
  mapping: z.object({
    date: z.string(),
    amount: z.string(),
    description: z.string().optional(),
    merchant: z.string().optional(),
    category: z.string().optional(),
    note: z.string().optional(),
    /** Some exports use separate debit/credit columns. */
    debit: z.string().optional(),
    credit: z.string().optional(),
  }),
  dateFormat: z.string().max(32).optional(),
  /** Some banks export expenses as positive numbers. */
  invertAmounts: z.boolean().default(false),
});

export const commitImportSchema = z.object({
  importJobId: cuid,
  rowIds: z.array(cuid).optional(),
  skipDuplicates: z.boolean().default(true),
});

/* ---------------------------------------------------------------- reports */

export const createReportSchema = z.object({
  kind: z.enum([
    "MONTHLY_STATEMENT", "ANNUAL_SUMMARY", "CATEGORY", "CASH_FLOW",
    "NET_WORTH", "TAX_SUMMARY", "SUBSCRIPTION_AUDIT", "REIMBURSEMENT", "FULL_EXPORT",
  ]),
  format: z.enum(["CSV", "XLSX", "PDF", "JSON"]),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  accountIds: z.array(cuid).optional(),
  categoryIds: z.array(cuid).optional(),
});

/* --------------------------------------------------------------- settings */

export const updateSettingsSchema = z.object({
  baseCurrency: currencyCode.optional(),
  locale: z.string().max(16).optional(),
  timezone: z.string().max(64).optional(),
  weekStartsOn: z.number().int().min(1).max(7).optional(),
  monthStartsOn: z.number().int().min(1).max(28).optional(),
  numberFormat: z.string().max(16).optional(),
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  hideBalances: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  aiAutoCategorise: z.boolean().optional(),
  aiAutoApplyMutations: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

export const setPasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(200)
      .regex(/[a-zA-Z]/, "Include a letter.")
      .regex(/[0-9]/, "Include a number."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Those passwords don't match.",
    path: ["confirm"],
  });

/* -------------------------------------------------------------- household */

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address."),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

/* --------------------------------------------------------------------- AI */

export const aiChatSchema = z.object({
  conversationId: cuid.optional(),
  message: z.string().trim().min(1, "Ask something.").max(4000),
  attachmentIds: z.array(cuid).max(5).default([]),
});

export const confirmToolCallSchema = z.object({
  toolCallId: cuid,
  decision: z.enum(["CONFIRM", "CANCEL"]),
  /** Lets the user tweak the proposal before it runs. */
  overrides: z.record(z.string(), z.unknown()).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
