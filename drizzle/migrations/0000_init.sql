CREATE TYPE "public"."AccountType" AS ENUM('CASH', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'DEBIT_CARD', 'PREPAID', 'DIGITAL_WALLET', 'INVESTMENT', 'LOAN', 'LIABILITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ActorType" AS ENUM('USER', 'SYSTEM', 'RULE', 'AI', 'ADMIN', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."AdminRole" AS ENUM('SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'ANALYST', 'READ_ONLY');--> statement-breakpoint
CREATE TYPE "public"."AIFeature" AS ENUM('CHAT', 'CATEGORISE', 'RECEIPT_EXTRACT', 'MERCHANT_MATCH', 'WEEKLY_BRIEF', 'ANOMALY_DETECT', 'RECURRING_DETECT', 'BUDGET_SUGGEST', 'FORECAST', 'REPORT_NARRATIVE', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."AIMode" AS ENUM('ASSISTANT', 'AGENT', 'BRIEF', 'CATEGORISE', 'RECEIPT', 'ANALYSIS');--> statement-breakpoint
CREATE TYPE "public"."AIRole" AS ENUM('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."AmountMode" AS ENUM('FIXED', 'VARIABLE');--> statement-breakpoint
CREATE TYPE "public"."BillOccurrenceStatus" AS ENUM('SCHEDULED', 'DUE', 'PAID', 'OVERDUE', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."BillStatus" AS ENUM('ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."BillingCycle" AS ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."BudgetPeriod" AS ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."BudgetStatus" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."CategoryKind" AS ENUM('EXPENSE', 'INCOME', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."ConsentKind" AS ENUM('TERMS', 'PRIVACY', 'AI_PROCESSING', 'MARKETING_EMAIL');--> statement-breakpoint
CREATE TYPE "public"."CreatedVia" AS ENUM('MANUAL', 'IMPORT', 'RECURRING', 'RULE', 'AI', 'RECEIPT', 'API', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."DebtKind" AS ENUM('LOAN', 'CREDIT_CARD', 'MORTGAGE', 'STUDENT_LOAN', 'MEDICAL', 'PERSONAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."DebtStatus" AS ENUM('ACTIVE', 'PAID_OFF', 'DEFAULTED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."EventSeverity" AS ENUM('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."Frequency" AS ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM_DAYS');--> statement-breakpoint
CREATE TYPE "public"."GoalStatus" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."HouseholdRole" AS ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."ImportRowStatus" AS ENUM('PENDING', 'READY', 'DUPLICATE', 'ERROR', 'IMPORTED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."ImportStatus" AS ENUM('UPLOADED', 'PARSING', 'MAPPING', 'PREVIEW', 'COMMITTING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."LendingDirection" AS ENUM('LENT', 'BORROWED');--> statement-breakpoint
CREATE TYPE "public"."LendingStatus" AS ENUM('OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'WRITTEN_OFF');--> statement-breakpoint
CREATE TYPE "public"."NotificationKind" AS ENUM('BILL_DUE', 'BILL_OVERDUE', 'BUDGET_THRESHOLD', 'BUDGET_EXCEEDED', 'UNUSUAL_TRANSACTION', 'SUBSCRIPTION_RENEWAL', 'TRIAL_ENDING', 'LOW_BALANCE', 'GOAL_MILESTONE', 'GOAL_COMPLETED', 'RECURRING_CREATED', 'MONTHLY_SUMMARY', 'WEEKLY_BRIEF', 'NEW_SIGN_IN', 'IMPORT_COMPLETE', 'REPORT_READY', 'RECEIPT_PROCESSED', 'HOUSEHOLD_INVITE', 'SECURITY_ALERT');--> statement-breakpoint
CREATE TYPE "public"."NotificationSeverity" AS ENUM('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."OccurrenceStatus" AS ENUM('SCHEDULED', 'CREATED', 'SKIPPED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ReceiptStatus" AS ENUM('PENDING', 'PROCESSING', 'EXTRACTED', 'MATCHED', 'NEEDS_REVIEW', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ReconciliationStatus" AS ENUM('IN_PROGRESS', 'BALANCED', 'CLOSED_WITH_VARIANCE', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."RecurringStatus" AS ENUM('ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."ReportFormat" AS ENUM('CSV', 'XLSX', 'PDF', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."ReportKind" AS ENUM('MONTHLY_STATEMENT', 'ANNUAL_SUMMARY', 'CATEGORY', 'CASH_FLOW', 'NET_WORTH', 'TAX_SUMMARY', 'SUBSCRIPTION_AUDIT', 'REIMBURSEMENT', 'FULL_EXPORT');--> statement-breakpoint
CREATE TYPE "public"."ReportStatus" AS ENUM('QUEUED', 'BUILDING', 'READY', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionStatus" AS ENUM('TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."SystemEventKind" AS ENUM('JOB_RUN', 'ERROR', 'AUTH_EVENT', 'RATE_LIMIT', 'UPSTREAM', 'MIGRATION', 'ADMIN_ACTION');--> statement-breakpoint
CREATE TYPE "public"."Theme" AS ENUM('SYSTEM', 'LIGHT', 'DARK');--> statement-breakpoint
CREATE TYPE "public"."ToolCallStatus" AS ENUM('EXECUTED', 'PROPOSED', 'CONFIRMED', 'CANCELLED', 'BLOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."TransactionStatus" AS ENUM('PENDING', 'CLEARED', 'RECONCILED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('EXPENSE', 'INCOME', 'TRANSFER_OUT', 'TRANSFER_IN', 'CREDIT_CARD_PAYMENT', 'CREDIT_CARD_RECEIPT', 'REFUND', 'REIMBURSEMENT', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'DEBT_PAYMENT', 'LENDING_OUT', 'LENDING_REPAYMENT_IN', 'BORROWING_IN', 'BORROWING_REPAYMENT_OUT', 'GOAL_CONTRIBUTION', 'FEE', 'INTEREST', 'DIVIDEND');--> statement-breakpoint
CREATE TYPE "public"."TransferKind" AS ENUM('TRANSFER', 'CREDIT_CARD_PAYMENT', 'GOAL_CONTRIBUTION', 'DEBT_PAYMENT', 'LENDING');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."Visibility" AS ENUM('PRIVATE', 'HOUSEHOLD');--> statement-breakpoint
CREATE TYPE "public"."WeekendPolicy" AS ENUM('KEEP', 'PREVIOUS_WEEKDAY', 'NEXT_WEEKDAY');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"type" "AccountType" NOT NULL,
	"currency" char(3) NOT NULL,
	"institution" text,
	"mask" varchar(4),
	"colorIndex" integer DEFAULT 12 NOT NULL,
	"icon" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"openingBalanceMinor" bigint DEFAULT 0 NOT NULL,
	"cachedBalanceMinor" bigint DEFAULT 0 NOT NULL,
	"cachedBalanceAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"creditLimitMinor" bigint,
	"statementDay" integer,
	"paymentDueDay" integer,
	"aprBps" integer,
	"interestRateBps" integer,
	"visibility" "Visibility" DEFAULT 'PRIVATE' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"excludeFromNetWorth" boolean DEFAULT false NOT NULL,
	"lastReconciledAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"archivedAt" timestamp (3),
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"adminUserId" text NOT NULL,
	"action" text NOT NULL,
	"targetType" text,
	"targetId" text,
	"reason" text,
	"metadata" jsonb,
	"ipHash" text,
	"userAgent" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"role" "AdminRole" DEFAULT 'SUPPORT' NOT NULL,
	"extraPermissions" text[] DEFAULT '{}',
	"mfaEnabled" boolean DEFAULT false NOT NULL,
	"lastSeenAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"revokedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text,
	"mode" "AIMode" DEFAULT 'ASSISTANT' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"archivedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"role" "AIRole" NOT NULL,
	"content" jsonb NOT NULL,
	"model" text,
	"stopReason" text,
	"inputTokens" integer,
	"outputTokens" integer,
	"cacheReadTokens" integer,
	"cacheWriteTokens" integer,
	"latencyMs" integer,
	"errorCode" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"userId" text NOT NULL,
	"toolName" text NOT NULL,
	"toolUseId" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"mutating" boolean DEFAULT false NOT NULL,
	"status" "ToolCallStatus" DEFAULT 'EXECUTED' NOT NULL,
	"refusalCode" text,
	"errorCode" text,
	"durationMs" integer,
	"confirmedAt" timestamp (3),
	"executedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"feature" "AIFeature" NOT NULL,
	"model" text NOT NULL,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"cacheReadTokens" integer DEFAULT 0 NOT NULL,
	"cacheWriteTokens" integer DEFAULT 0 NOT NULL,
	"estimatedCostMicros" bigint DEFAULT 0 NOT NULL,
	"latencyMs" integer,
	"toolCalls" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"errorCode" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"transactionId" text,
	"storageKey" text NOT NULL,
	"filename" text NOT NULL,
	"contentType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"width" integer,
	"height" integer,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"actorType" "ActorType" DEFAULT 'USER' NOT NULL,
	"actorId" text,
	"actorLabel" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ipHash" text,
	"userAgent" text,
	"requestId" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "bill_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"billId" text NOT NULL,
	"dueOn" date NOT NULL,
	"expectedMinor" bigint NOT NULL,
	"paidMinor" bigint,
	"status" "BillOccurrenceStatus" DEFAULT 'SCHEDULED' NOT NULL,
	"paidAt" timestamp (3),
	"dismissedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"accountId" text NOT NULL,
	"categoryId" text,
	"recurringId" text,
	"amountMode" "AmountMode" DEFAULT 'FIXED' NOT NULL,
	"amountMinor" bigint,
	"currency" char(3) NOT NULL,
	"dueDay" integer,
	"autoPay" boolean DEFAULT false NOT NULL,
	"reminderDaysBefore" integer DEFAULT 3 NOT NULL,
	"status" "BillStatus" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"budgetId" text NOT NULL,
	"categoryId" text NOT NULL,
	"limitMinor" bigint NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"rolloverMinor" bigint DEFAULT 0 NOT NULL,
	"rolloverUpdatedAt" timestamp (3),
	"fixed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"period" "BudgetPeriod" NOT NULL,
	"startsOn" date,
	"endsOn" date,
	"totalLimitMinor" bigint,
	"currency" char(3) NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"alertThresholds" integer[] DEFAULT '{80,100}',
	"visibility" "Visibility" DEFAULT 'PRIVATE' NOT NULL,
	"status" "BudgetStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"parentId" text,
	"name" text NOT NULL,
	"kind" "CategoryKind" DEFAULT 'EXPENSE' NOT NULL,
	"colorIndex" integer DEFAULT 12 NOT NULL,
	"icon" text DEFAULT 'tag' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isSystem" boolean DEFAULT false NOT NULL,
	"slug" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"archivedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"debtId" text NOT NULL,
	"transactionId" text,
	"amountMinor" bigint NOT NULL,
	"principalMinor" bigint NOT NULL,
	"interestMinor" bigint NOT NULL,
	"feeMinor" bigint DEFAULT 0 NOT NULL,
	"balanceAfterMinor" bigint NOT NULL,
	"occurredAt" timestamp (3) NOT NULL,
	"note" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"kind" "DebtKind" DEFAULT 'LOAN' NOT NULL,
	"linkedAccountId" text,
	"principalMinor" bigint NOT NULL,
	"currentBalanceMinor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"aprBps" integer NOT NULL,
	"minimumPaymentMinor" bigint NOT NULL,
	"paymentDay" integer,
	"termMonths" integer,
	"startedOn" date NOT NULL,
	"payoffTargetOn" date,
	"status" "DebtStatus" DEFAULT 'ACTIVE' NOT NULL,
	"closedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"rate" numeric(24, 12) NOT NULL,
	"asOf" date NOT NULL,
	"source" text DEFAULT 'ecb' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rolloutPercent" integer DEFAULT 0 NOT NULL,
	"allowUserIds" text[] DEFAULT '{}',
	"denyUserIds" text[] DEFAULT '{}',
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"matchAll" boolean DEFAULT true NOT NULL,
	"stopOnMatch" boolean DEFAULT false NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"appliedCount" integer DEFAULT 0 NOT NULL,
	"lastAppliedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"goalId" text NOT NULL,
	"transactionId" text,
	"amountMinor" bigint NOT NULL,
	"occurredAt" timestamp (3) NOT NULL,
	"note" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"goalId" text NOT NULL,
	"name" text NOT NULL,
	"amountMinor" bigint NOT NULL,
	"reachedAt" timestamp (3),
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"targetMinor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"targetDate" date,
	"linkedAccountId" text,
	"contributionMinor" bigint,
	"contributionFreq" "Frequency",
	"colorIndex" integer DEFAULT 11 NOT NULL,
	"icon" text DEFAULT 'flag' NOT NULL,
	"note" text,
	"status" "GoalStatus" DEFAULT 'ACTIVE' NOT NULL,
	"completedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "household_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"householdId" text NOT NULL,
	"email" text NOT NULL,
	"role" "HouseholdRole" DEFAULT 'MEMBER' NOT NULL,
	"tokenHash" text NOT NULL,
	"invitedById" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"acceptedAt" timestamp (3),
	"revokedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" text PRIMARY KEY NOT NULL,
	"householdId" text NOT NULL,
	"userId" text NOT NULL,
	"role" "HouseholdRole" DEFAULT 'MEMBER' NOT NULL,
	"joinedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"removedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ownerId" text NOT NULL,
	"baseCurrency" char(3) DEFAULT 'USD' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text,
	"filename" text NOT NULL,
	"contentType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"storageKey" text,
	"status" "ImportStatus" DEFAULT 'UPLOADED' NOT NULL,
	"detection" jsonb,
	"mapping" jsonb,
	"totalRows" integer DEFAULT 0 NOT NULL,
	"importedRows" integer DEFAULT 0 NOT NULL,
	"duplicateRows" integer DEFAULT 0 NOT NULL,
	"errorRows" integer DEFAULT 0 NOT NULL,
	"errorMessage" text,
	"startedAt" timestamp (3),
	"completedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"importJobId" text NOT NULL,
	"rowNumber" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"parsed" jsonb,
	"status" "ImportRowStatus" DEFAULT 'PENDING' NOT NULL,
	"message" text,
	"dedupeKey" text
);
--> statement-breakpoint
CREATE TABLE "lending_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"lendingId" text NOT NULL,
	"transactionId" text,
	"amountMinor" bigint NOT NULL,
	"occurredAt" timestamp (3) NOT NULL,
	"method" text,
	"note" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lending_records" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"direction" "LendingDirection" NOT NULL,
	"personName" text NOT NULL,
	"personEmail" text,
	"principalMinor" bigint NOT NULL,
	"outstandingMinor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"occurredAt" timestamp (3) NOT NULL,
	"dueOn" date,
	"note" text,
	"status" "LendingStatus" DEFAULT 'OPEN' NOT NULL,
	"settledAt" timestamp (3),
	"writtenOffAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"email" text NOT NULL,
	"ipHash" text NOT NULL,
	"success" boolean NOT NULL,
	"reason" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"pattern" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"normalizedName" text NOT NULL,
	"defaultCategoryId" text,
	"logoUrl" text,
	"website" text,
	"mcc" varchar(4),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" "NotificationKind" NOT NULL,
	"inApp" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"email" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" "NotificationKind" NOT NULL,
	"severity" "NotificationSeverity" DEFAULT 'INFO' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"readAt" timestamp (3),
	"dismissedAt" timestamp (3),
	"dedupeKey" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256Dh" text NOT NULL,
	"auth" text NOT NULL,
	"userAgent" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastUsedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"windowEnd" timestamp (3) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"receiptId" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3),
	"unitMinor" bigint,
	"totalMinor" bigint NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"attachmentId" text NOT NULL,
	"transactionId" text,
	"status" "ReceiptStatus" DEFAULT 'PENDING' NOT NULL,
	"confidence" double precision,
	"merchantName" text,
	"totalMinor" bigint,
	"taxMinor" bigint,
	"tipMinor" bigint,
	"currency" char(3),
	"purchasedAt" timestamp (3),
	"rawText" text,
	"extraction" jsonb,
	"errorCode" text,
	"processedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"statementDate" date NOT NULL,
	"recordedMinor" bigint NOT NULL,
	"actualMinor" bigint NOT NULL,
	"differenceMinor" bigint NOT NULL,
	"adjustmentMinor" bigint DEFAULT 0 NOT NULL,
	"status" "ReconciliationStatus" DEFAULT 'IN_PROGRESS' NOT NULL,
	"closedAt" timestamp (3),
	"note" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"recurringId" text NOT NULL,
	"dueOn" date NOT NULL,
	"status" "OccurrenceStatus" DEFAULT 'SCHEDULED' NOT NULL,
	"amountMinor" bigint,
	"transactionId" text,
	"skippedReason" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"type" "TransactionType" NOT NULL,
	"accountId" text NOT NULL,
	"toAccountId" text,
	"categoryId" text,
	"amountMode" "AmountMode" DEFAULT 'FIXED' NOT NULL,
	"amountMinor" bigint,
	"currency" char(3) NOT NULL,
	"estimateWindow" integer DEFAULT 6 NOT NULL,
	"frequency" "Frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"byWeekday" integer,
	"byMonthDay" integer,
	"byMonth" integer,
	"weekendPolicy" "WeekendPolicy" DEFAULT 'KEEP' NOT NULL,
	"startsOn" date NOT NULL,
	"endsOn" date,
	"maxOccurrences" integer,
	"leadDays" integer DEFAULT 2 NOT NULL,
	"autoCreate" boolean DEFAULT true NOT NULL,
	"reminder" boolean DEFAULT true NOT NULL,
	"reminderDaysBefore" integer DEFAULT 1 NOT NULL,
	"status" "RecurringStatus" DEFAULT 'ACTIVE' NOT NULL,
	"pausedAt" timestamp (3),
	"lastRunOn" date,
	"nextDueOn" date,
	"note" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "report_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" "ReportKind" NOT NULL,
	"format" "ReportFormat" NOT NULL,
	"params" jsonb NOT NULL,
	"status" "ReportStatus" DEFAULT 'QUEUED' NOT NULL,
	"storageKey" text,
	"sizeBytes" integer,
	"errorMessage" text,
	"expiresAt" timestamp (3),
	"completedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"sessionToken" text NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp (3) NOT NULL,
	"userAgent" text,
	"ipHash" text,
	"location" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastSeenAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"revokedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"merchantId" text,
	"categoryId" text,
	"accountId" text NOT NULL,
	"recurringId" text,
	"planName" text,
	"priceMinor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"cycle" "BillingCycle" NOT NULL,
	"cycleCount" integer DEFAULT 1 NOT NULL,
	"startedOn" date NOT NULL,
	"trialEndsOn" date,
	"renewsOn" date,
	"cancelledOn" date,
	"status" "SubscriptionStatus" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"websiteUrl" text,
	"cancelUrl" text,
	"lastUsedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_events" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "SystemEventKind" NOT NULL,
	"severity" "EventSeverity" DEFAULT 'INFO' NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"fingerprint" text,
	"metadata" jsonb,
	"durationMs" integer,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"colorIndex" integer DEFAULT 12 NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" text PRIMARY KEY NOT NULL,
	"transactionId" text NOT NULL,
	"categoryId" text,
	"amountMinor" bigint NOT NULL,
	"baseAmountMinor" bigint NOT NULL,
	"note" text,
	"owedByLabel" text,
	"settledAt" timestamp (3),
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"transactionId" text NOT NULL,
	"tagId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "transaction_tags_pkey" PRIMARY KEY("transactionId","tagId")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"type" "TransactionType" NOT NULL,
	"status" "TransactionStatus" DEFAULT 'CLEARED' NOT NULL,
	"direction" integer NOT NULL,
	"amountMinor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"accountAmountMinor" bigint,
	"fxRate" numeric(24, 12),
	"baseAmountMinor" bigint NOT NULL,
	"baseCurrency" char(3) NOT NULL,
	"occurredAt" timestamp (3) NOT NULL,
	"postedAt" timestamp (3),
	"categoryId" text,
	"merchantId" text,
	"rawDescriptor" text,
	"description" text,
	"note" text,
	"locationLabel" text,
	"latitude" double precision,
	"longitude" double precision,
	"externalRef" text,
	"isSplit" boolean DEFAULT false NOT NULL,
	"excludeFromBudget" boolean DEFAULT false NOT NULL,
	"excludeFromReports" boolean DEFAULT false NOT NULL,
	"needsReview" boolean DEFAULT false NOT NULL,
	"reversesTransactionId" text,
	"transferId" text,
	"recurringId" text,
	"billOccurrenceId" text,
	"debtPaymentId" text,
	"lendingPaymentId" text,
	"goalContributionId" text,
	"importRowId" text,
	"reconciliationId" text,
	"createdById" text,
	"createdVia" "CreatedVia" DEFAULT 'MANUAL' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" "TransferKind" DEFAULT 'TRANSFER' NOT NULL,
	"fromAccountId" text NOT NULL,
	"toAccountId" text NOT NULL,
	"fromAmountMinor" bigint NOT NULL,
	"fromCurrency" char(3) NOT NULL,
	"toAmountMinor" bigint NOT NULL,
	"toCurrency" char(3) NOT NULL,
	"fxRate" numeric(24, 12),
	"feeMinor" bigint DEFAULT 0 NOT NULL,
	"occurredAt" timestamp (3) NOT NULL,
	"note" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" "ConsentKind" NOT NULL,
	"granted" boolean NOT NULL,
	"version" text NOT NULL,
	"grantedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"revokedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"baseCurrency" char(3) DEFAULT 'USD' NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"weekStartsOn" integer DEFAULT 1 NOT NULL,
	"monthStartsOn" integer DEFAULT 1 NOT NULL,
	"numberFormat" text DEFAULT '1,234.56' NOT NULL,
	"theme" "Theme" DEFAULT 'SYSTEM' NOT NULL,
	"hideBalances" boolean DEFAULT false NOT NULL,
	"reduceMotion" boolean DEFAULT false NOT NULL,
	"aiEnabled" boolean DEFAULT true NOT NULL,
	"aiAutoCategorise" boolean DEFAULT true NOT NULL,
	"aiAutoApplyMutations" boolean DEFAULT false NOT NULL,
	"quietHoursStart" text,
	"quietHoursEnd" text,
	"onboardingStep" integer DEFAULT 0 NOT NULL,
	"onboardingCompletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"emailVerified" timestamp (3),
	"name" text,
	"image" text,
	"passwordHash" text,
	"passwordSetAt" timestamp (3),
	"status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
	"suspendedAt" timestamp (3),
	"suspendReason" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"lastActiveAt" timestamp (3),
	"deletedAt" timestamp (3),
	"purgeAfter" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ai_messages"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bill_occurrences" ADD CONSTRAINT "bill_occurrences_billId_fkey" FOREIGN KEY ("billId") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "public"."recurring_transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "financial_rules" ADD CONSTRAINT "financial_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lending_payments" ADD CONSTRAINT "lending_payments_lendingId_fkey" FOREIGN KEY ("lendingId") REFERENCES "public"."lending_records"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lending_payments" ADD CONSTRAINT "lending_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lending_records" ADD CONSTRAINT "lending_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "public"."recurring_transactions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "public"."recurring_transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "public"."recurring_transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_billOccurrenceId_fkey" FOREIGN KEY ("billOccurrenceId") REFERENCES "public"."bill_occurrences"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "public"."reconciliations"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "public"."import_rows"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversesTransactionId_fkey" FOREIGN KEY ("reversesTransactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "accounts_userId_archivedAt_sortOrder_idx" ON "accounts" USING btree ("userId","archivedAt","sortOrder");--> statement-breakpoint
CREATE INDEX "accounts_userId_type_idx" ON "accounts" USING btree ("userId","type");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs" USING btree ("action","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_adminUserId_createdAt_idx" ON "admin_audit_logs" USING btree ("adminUserId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "admin_users_role_revokedAt_idx" ON "admin_users" USING btree ("role","revokedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_userId_key" ON "admin_users" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ai_conversations_userId_updatedAt_idx" ON "ai_conversations" USING btree ("userId","updatedAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_toolName_status_idx" ON "ai_tool_calls" USING btree ("toolName","status");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_userId_createdAt_idx" ON "ai_tool_calls" USING btree ("userId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_createdAt_idx" ON "ai_usage" USING btree ("feature","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage" USING btree ("userId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "attachments_transactionId_idx" ON "attachments" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "attachments_userId_createdAt_idx" ON "attachments" USING btree ("userId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs" USING btree ("entityType","entityId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_logs_userId_action_idx" ON "audit_logs" USING btree ("userId","action");--> statement-breakpoint
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs" USING btree ("userId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_providerAccountId_key" ON "auth_accounts" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_occurrences_billId_dueOn_key" ON "bill_occurrences" USING btree ("billId","dueOn");--> statement-breakpoint
CREATE INDEX "bill_occurrences_status_dueOn_idx" ON "bill_occurrences" USING btree ("status","dueOn");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_recurringId_key" ON "bills" USING btree ("recurringId");--> statement-breakpoint
CREATE INDEX "bills_userId_status_idx" ON "bills" USING btree ("userId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_budgetId_categoryId_key" ON "budget_categories" USING btree ("budgetId","categoryId");--> statement-breakpoint
CREATE INDEX "budget_categories_categoryId_idx" ON "budget_categories" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "budgets_userId_status_period_idx" ON "budgets" USING btree ("userId","status","period");--> statement-breakpoint
CREATE INDEX "categories_parentId_idx" ON "categories" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "categories_userId_kind_archivedAt_sortOrder_idx" ON "categories" USING btree ("userId","kind","archivedAt","sortOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_userId_slug_key" ON "categories" USING btree ("userId","slug");--> statement-breakpoint
CREATE INDEX "debt_payments_debtId_occurredAt_idx" ON "debt_payments" USING btree ("debtId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_transactionId_key" ON "debt_payments" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "debts_userId_status_idx" ON "debts" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "exchange_rates_base_quote_asOf_idx" ON "exchange_rates" USING btree ("base","quote","asOf" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_base_quote_asOf_key" ON "exchange_rates" USING btree ("base","quote","asOf");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE INDEX "financial_rules_userId_enabled_priority_idx" ON "financial_rules" USING btree ("userId","enabled","priority");--> statement-breakpoint
CREATE INDEX "goal_contributions_goalId_occurredAt_idx" ON "goal_contributions" USING btree ("goalId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "goal_contributions_transactionId_key" ON "goal_contributions" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "goal_milestones_goalId_sortOrder_idx" ON "goal_milestones" USING btree ("goalId","sortOrder");--> statement-breakpoint
CREATE INDEX "goals_userId_status_targetDate_idx" ON "goals" USING btree ("userId","status","targetDate");--> statement-breakpoint
CREATE INDEX "household_invites_email_idx" ON "household_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "household_invites_householdId_acceptedAt_idx" ON "household_invites" USING btree ("householdId","acceptedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "household_invites_tokenHash_key" ON "household_invites" USING btree ("tokenHash");--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_householdId_userId_key" ON "household_members" USING btree ("householdId","userId");--> statement-breakpoint
CREATE INDEX "household_members_userId_removedAt_idx" ON "household_members" USING btree ("userId","removedAt");--> statement-breakpoint
CREATE INDEX "households_ownerId_idx" ON "households" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "import_jobs_userId_createdAt_idx" ON "import_jobs" USING btree ("userId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "import_rows_dedupeKey_idx" ON "import_rows" USING btree ("dedupeKey");--> statement-breakpoint
CREATE INDEX "import_rows_importJobId_status_idx" ON "import_rows" USING btree ("importJobId","status");--> statement-breakpoint
CREATE INDEX "lending_payments_lendingId_occurredAt_idx" ON "lending_payments" USING btree ("lendingId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "lending_payments_transactionId_key" ON "lending_payments" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "lending_records_userId_status_direction_idx" ON "lending_records" USING btree ("userId","status","direction");--> statement-breakpoint
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts" USING btree ("email","createdAt");--> statement-breakpoint
CREATE INDEX "login_attempts_ipHash_createdAt_idx" ON "login_attempts" USING btree ("ipHash","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_aliases_merchantId_pattern_key" ON "merchant_aliases" USING btree ("merchantId","pattern");--> statement-breakpoint
CREATE INDEX "merchant_aliases_pattern_idx" ON "merchant_aliases" USING btree ("pattern");--> statement-breakpoint
CREATE INDEX "merchants_userId_name_idx" ON "merchants" USING btree ("userId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_userId_normalizedName_key" ON "merchants" USING btree ("userId","normalizedName");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_userId_kind_key" ON "notification_preferences" USING btree ("userId","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications" USING btree ("userId","dedupeKey");--> statement-breakpoint
CREATE INDEX "notifications_userId_kind_idx" ON "notifications" USING btree ("userId","kind");--> statement-breakpoint
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications" USING btree ("userId","readAt","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_counters_bucket_windowEnd_key" ON "rate_limit_counters" USING btree ("bucket","windowEnd");--> statement-breakpoint
CREATE INDEX "rate_limit_counters_windowEnd_idx" ON "rate_limit_counters" USING btree ("windowEnd");--> statement-breakpoint
CREATE INDEX "receipt_line_items_receiptId_idx" ON "receipt_line_items" USING btree ("receiptId");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_attachmentId_key" ON "receipts" USING btree ("attachmentId");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_transactionId_key" ON "receipts" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "receipts_userId_status_createdAt_idx" ON "receipts" USING btree ("userId","status","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "reconciliations_userId_accountId_statementDate_idx" ON "reconciliations" USING btree ("userId","accountId","statementDate" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_occurrences_recurringId_dueOn_key" ON "recurring_occurrences" USING btree ("recurringId","dueOn");--> statement-breakpoint
CREATE INDEX "recurring_occurrences_status_dueOn_idx" ON "recurring_occurrences" USING btree ("status","dueOn");--> statement-breakpoint
CREATE INDEX "recurring_transactions_nextDueOn_status_idx" ON "recurring_transactions" USING btree ("nextDueOn","status");--> statement-breakpoint
CREATE INDEX "recurring_transactions_userId_status_nextDueOn_idx" ON "recurring_transactions" USING btree ("userId","status","nextDueOn");--> statement-breakpoint
CREATE INDEX "report_jobs_userId_createdAt_idx" ON "report_jobs" USING btree ("userId","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions" USING btree ("sessionToken");--> statement-breakpoint
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions" USING btree ("userId","revokedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_recurringId_key" ON "subscriptions" USING btree ("recurringId");--> statement-breakpoint
CREATE INDEX "subscriptions_userId_status_renewsOn_idx" ON "subscriptions" USING btree ("userId","status","renewsOn");--> statement-breakpoint
CREATE INDEX "subscriptions_userId_trialEndsOn_idx" ON "subscriptions" USING btree ("userId","trialEndsOn");--> statement-breakpoint
CREATE INDEX "system_events_fingerprint_createdAt_idx" ON "system_events" USING btree ("fingerprint","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "system_events_kind_createdAt_idx" ON "system_events" USING btree ("kind","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "system_events_source_createdAt_idx" ON "system_events" USING btree ("source","createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "tags_userId_slug_key" ON "tags" USING btree ("userId","slug");--> statement-breakpoint
CREATE INDEX "transaction_splits_categoryId_idx" ON "transaction_splits" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "transaction_splits_transactionId_idx" ON "transaction_splits" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "transaction_tags_tagId_idx" ON "transaction_tags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "transactions_accountId_deletedAt_idx" ON "transactions" USING btree ("accountId","deletedAt");--> statement-breakpoint
CREATE INDEX "transactions_deletedAt_idx" ON "transactions" USING btree ("deletedAt");--> statement-breakpoint
CREATE INDEX "transactions_recurringId_idx" ON "transactions" USING btree ("recurringId");--> statement-breakpoint
CREATE INDEX "transactions_transferId_idx" ON "transactions" USING btree ("transferId");--> statement-breakpoint
CREATE INDEX "transactions_userId_accountId_occurredAt_idx" ON "transactions" USING btree ("userId","accountId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transactions_userId_categoryId_occurredAt_idx" ON "transactions" USING btree ("userId","categoryId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transactions_userId_merchantId_occurredAt_idx" ON "transactions" USING btree ("userId","merchantId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transactions_userId_needsReview_idx" ON "transactions" USING btree ("userId","needsReview");--> statement-breakpoint
CREATE INDEX "transactions_userId_occurredAt_id_idx" ON "transactions" USING btree ("userId","occurredAt" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transactions_userId_status_idx" ON "transactions" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "transactions_userId_type_occurredAt_idx" ON "transactions" USING btree ("userId","type","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transfers_fromAccountId_idx" ON "transfers" USING btree ("fromAccountId");--> statement-breakpoint
CREATE INDEX "transfers_toAccountId_idx" ON "transfers" USING btree ("toAccountId");--> statement-breakpoint
CREATE INDEX "transfers_userId_occurredAt_idx" ON "transfers" USING btree ("userId","occurredAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "user_consents_userId_kind_version_key" ON "user_consents" USING btree ("userId","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "users_deletedAt_idx" ON "users" USING btree ("deletedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_lastActiveAt_idx" ON "users" USING btree ("status","lastActiveAt");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens" USING btree ("token");