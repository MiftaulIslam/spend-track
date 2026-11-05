/**
 * Relations for Drizzle's relational query API (`db.query.*`).
 *
 * These describe how rows join for `with: { … }`; they do not create foreign
 * keys — the constraints themselves live in the schema module.
 */

import { relations } from "drizzle-orm/relations";
import {
  users,
  sessions,
  loginAttempts,
  userConsents,
  userSettings,
  pushSubscriptions,
  households,
  accounts,
  householdMembers,
  householdInvites,
  categories,
  merchants,
  tags,
  transactions,
  transfers,
  recurringTransactions,
  billOccurrences,
  reconciliations,
  importRows,
  transactionSplits,
  attachments,
  receipts,
  merchantAliases,
  bills,
  subscriptions,
  budgets,
  receiptLineItems,
  recurringOccurrences,
  goals,
  goalMilestones,
  goalContributions,
  debts,
  lendingRecords,
  lendingPayments,
  financialRules,
  importJobs,
  reportJobs,
  debtPayments,
  notifications,
  notificationPreferences,
  auditLogs,
  aiConversations,
  aiMessages,
  aiToolCalls,
  aiUsage,
  adminUsers,
  adminAuditLogs,
  authAccounts,
  budgetCategories,
  transactionTags,
} from "./schema";

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  loginAttempts: many(loginAttempts),
  userConsents: many(userConsents),
  userSettings: many(userSettings),
  pushSubscriptions: many(pushSubscriptions),
  households: many(households),
  accounts: many(accounts),
  householdMembers: many(householdMembers),
  categories: many(categories),
  merchants: many(merchants),
  tags: many(tags),
  transactions: many(transactions),
  transfers: many(transfers),
  attachments: many(attachments),
  receipts: many(receipts),
  subscriptions: many(subscriptions),
  bills: many(bills),
  budgets: many(budgets),
  recurringTransactions: many(recurringTransactions),
  debts: many(debts),
  goals: many(goals),
  lendingRecords: many(lendingRecords),
  financialRules: many(financialRules),
  importJobs: many(importJobs),
  reportJobs: many(reportJobs),
  notifications: many(notifications),
  notificationPreferences: many(notificationPreferences),
  auditLogs: many(auditLogs),
  reconciliations: many(reconciliations),
  aiUsages: many(aiUsage),
  adminUsers: many(adminUsers),
  authAccounts: many(authAccounts),
  aiConversations: many(aiConversations),
}));

export const loginAttemptsRelations = relations(loginAttempts, ({ one }) => ({
  user: one(users, {
    fields: [loginAttempts.userId],
    references: [users.id],
  }),
}));

export const userConsentsRelations = relations(userConsents, ({ one }) => ({
  user: one(users, {
    fields: [userConsents.userId],
    references: [users.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
  user: one(users, {
    fields: [households.ownerId],
    references: [users.id],
  }),
  householdMembers: many(householdMembers),
  householdInvites: many(householdInvites),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
  subscriptions: many(subscriptions),
  bills: many(bills),
  recurringTransactions: many(recurringTransactions),
  debts: many(debts),
  goals: many(goals),
  importJobs: many(importJobs),
  reconciliations: many(reconciliations),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.id],
  }),
  user: one(users, {
    fields: [householdMembers.userId],
    references: [users.id],
  }),
}));

export const householdInvitesRelations = relations(householdInvites, ({ one }) => ({
  household: one(households, {
    fields: [householdInvites.householdId],
    references: [households.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "categories_parentId_categories_id",
  }),
  categories: many(categories, {
    relationName: "categories_parentId_categories_id",
  }),
  merchants: many(merchants),
  transactions: many(transactions),
  transactionSplits: many(transactionSplits),
  subscriptions: many(subscriptions),
  bills: many(bills),
  recurringTransactions: many(recurringTransactions),
  budgetCategories: many(budgetCategories),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  user: one(users, {
    fields: [merchants.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [merchants.defaultCategoryId],
    references: [categories.id],
  }),
  transactions: many(transactions),
  merchantAliases: many(merchantAliases),
  subscriptions: many(subscriptions),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  transactionTags: many(transactionTags),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  transfer: one(transfers, {
    fields: [transactions.transferId],
    references: [transfers.id],
  }),
  recurringTransaction: one(recurringTransactions, {
    fields: [transactions.recurringId],
    references: [recurringTransactions.id],
  }),
  billOccurrence: one(billOccurrences, {
    fields: [transactions.billOccurrenceId],
    references: [billOccurrences.id],
  }),
  reconciliation: one(reconciliations, {
    fields: [transactions.reconciliationId],
    references: [reconciliations.id],
  }),
  importRow: one(importRows, {
    fields: [transactions.importRowId],
    references: [importRows.id],
  }),
  transaction: one(transactions, {
    fields: [transactions.reversesTransactionId],
    references: [transactions.id],
    relationName: "transactions_reversesTransactionId_transactions_id",
  }),
  transactions: many(transactions, {
    relationName: "transactions_reversesTransactionId_transactions_id",
  }),
  transactionSplits: many(transactionSplits),
  attachments: many(attachments),
  receipts: many(receipts),
  goalContributions: many(goalContributions),
  lendingPayments: many(lendingPayments),
  debtPayments: many(debtPayments),
  transactionTags: many(transactionTags),
}));

export const transfersRelations = relations(transfers, ({ one, many }) => ({
  transactions: many(transactions),
  user: one(users, {
    fields: [transfers.userId],
    references: [users.id],
  }),
}));

export const recurringTransactionsRelations = relations(recurringTransactions, ({ one, many }) => ({
  transactions: many(transactions),
  subscriptions: many(subscriptions),
  bills: many(bills),
  recurringOccurrences: many(recurringOccurrences),
  user: one(users, {
    fields: [recurringTransactions.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [recurringTransactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [recurringTransactions.categoryId],
    references: [categories.id],
  }),
}));

export const billOccurrencesRelations = relations(billOccurrences, ({ one, many }) => ({
  transactions: many(transactions),
  bill: one(bills, {
    fields: [billOccurrences.billId],
    references: [bills.id],
  }),
}));

export const reconciliationsRelations = relations(reconciliations, ({ one, many }) => ({
  transactions: many(transactions),
  user: one(users, {
    fields: [reconciliations.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [reconciliations.accountId],
    references: [accounts.id],
  }),
}));

export const importRowsRelations = relations(importRows, ({ one, many }) => ({
  transactions: many(transactions),
  importJob: one(importJobs, {
    fields: [importRows.importJobId],
    references: [importJobs.id],
  }),
}));

export const transactionSplitsRelations = relations(transactionSplits, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionSplits.transactionId],
    references: [transactions.id],
  }),
  category: one(categories, {
    fields: [transactionSplits.categoryId],
    references: [categories.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one, many }) => ({
  user: one(users, {
    fields: [attachments.userId],
    references: [users.id],
  }),
  transaction: one(transactions, {
    fields: [attachments.transactionId],
    references: [transactions.id],
  }),
  receipts: many(receipts),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  user: one(users, {
    fields: [receipts.userId],
    references: [users.id],
  }),
  attachment: one(attachments, {
    fields: [receipts.attachmentId],
    references: [attachments.id],
  }),
  transaction: one(transactions, {
    fields: [receipts.transactionId],
    references: [transactions.id],
  }),
  receiptLineItems: many(receiptLineItems),
}));

export const merchantAliasesRelations = relations(merchantAliases, ({ one }) => ({
  merchant: one(merchants, {
    fields: [merchantAliases.merchantId],
    references: [merchants.id],
  }),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  billOccurrences: many(billOccurrences),
  user: one(users, {
    fields: [bills.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [bills.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [bills.categoryId],
    references: [categories.id],
  }),
  recurringTransaction: one(recurringTransactions, {
    fields: [bills.recurringId],
    references: [recurringTransactions.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [subscriptions.accountId],
    references: [accounts.id],
  }),
  merchant: one(merchants, {
    fields: [subscriptions.merchantId],
    references: [merchants.id],
  }),
  category: one(categories, {
    fields: [subscriptions.categoryId],
    references: [categories.id],
  }),
  recurringTransaction: one(recurringTransactions, {
    fields: [subscriptions.recurringId],
    references: [recurringTransactions.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one, many }) => ({
  user: one(users, {
    fields: [budgets.userId],
    references: [users.id],
  }),
  budgetCategories: many(budgetCategories),
}));

export const receiptLineItemsRelations = relations(receiptLineItems, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptLineItems.receiptId],
    references: [receipts.id],
  }),
}));

export const recurringOccurrencesRelations = relations(recurringOccurrences, ({ one }) => ({
  recurringTransaction: one(recurringTransactions, {
    fields: [recurringOccurrences.recurringId],
    references: [recurringTransactions.id],
  }),
}));

export const goalMilestonesRelations = relations(goalMilestones, ({ one }) => ({
  goal: one(goals, {
    fields: [goalMilestones.goalId],
    references: [goals.id],
  }),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  goalMilestones: many(goalMilestones),
  goalContributions: many(goalContributions),
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [goals.linkedAccountId],
    references: [accounts.id],
  }),
}));

export const goalContributionsRelations = relations(goalContributions, ({ one }) => ({
  goal: one(goals, {
    fields: [goalContributions.goalId],
    references: [goals.id],
  }),
  transaction: one(transactions, {
    fields: [goalContributions.transactionId],
    references: [transactions.id],
  }),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
  user: one(users, {
    fields: [debts.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [debts.linkedAccountId],
    references: [accounts.id],
  }),
  debtPayments: many(debtPayments),
}));

export const lendingRecordsRelations = relations(lendingRecords, ({ one, many }) => ({
  user: one(users, {
    fields: [lendingRecords.userId],
    references: [users.id],
  }),
  lendingPayments: many(lendingPayments),
}));

export const lendingPaymentsRelations = relations(lendingPayments, ({ one }) => ({
  lendingRecord: one(lendingRecords, {
    fields: [lendingPayments.lendingId],
    references: [lendingRecords.id],
  }),
  transaction: one(transactions, {
    fields: [lendingPayments.transactionId],
    references: [transactions.id],
  }),
}));

export const financialRulesRelations = relations(financialRules, ({ one }) => ({
  user: one(users, {
    fields: [financialRules.userId],
    references: [users.id],
  }),
}));

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  importRows: many(importRows),
  user: one(users, {
    fields: [importJobs.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [importJobs.accountId],
    references: [accounts.id],
  }),
}));

export const reportJobsRelations = relations(reportJobs, ({ one }) => ({
  user: one(users, {
    fields: [reportJobs.userId],
    references: [users.id],
  }),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  debt: one(debts, {
    fields: [debtPayments.debtId],
    references: [debts.id],
  }),
  transaction: one(transactions, {
    fields: [debtPayments.transactionId],
    references: [transactions.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one, many }) => ({
  aiConversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
  aiToolCalls: many(aiToolCalls),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  aiMessages: many(aiMessages),
  user: one(users, {
    fields: [aiConversations.userId],
    references: [users.id],
  }),
}));

export const aiToolCallsRelations = relations(aiToolCalls, ({ one }) => ({
  aiMessage: one(aiMessages, {
    fields: [aiToolCalls.messageId],
    references: [aiMessages.id],
  }),
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(users, {
    fields: [aiUsage.userId],
    references: [users.id],
  }),
}));

export const adminUsersRelations = relations(adminUsers, ({ one, many }) => ({
  user: one(users, {
    fields: [adminUsers.userId],
    references: [users.id],
  }),
  adminAuditLogs: many(adminAuditLogs),
}));

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [adminAuditLogs.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, {
    fields: [authAccounts.userId],
    references: [users.id],
  }),
}));

export const budgetCategoriesRelations = relations(budgetCategories, ({ one }) => ({
  budget: one(budgets, {
    fields: [budgetCategories.budgetId],
    references: [budgets.id],
  }),
  category: one(categories, {
    fields: [budgetCategories.categoryId],
    references: [categories.id],
  }),
}));

export const transactionTagsRelations = relations(transactionTags, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionTags.transactionId],
    references: [transactions.id],
  }),
  tag: one(tags, {
    fields: [transactionTags.tagId],
    references: [tags.id],
  }),
}));
