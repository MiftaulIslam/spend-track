# Product Specification (SRS)

## 1. Purpose and scope

SpendTrack is a personal and household finance platform. It records everything a person
owns and owes, tracks where money moves, and helps them plan. It is not an expense
tracker: an expense tracker records outflows, SpendTrack keeps a ledger.

**In scope:** manual and imported transactions, all common account types, multi-currency,
recurring money, budgets, goals, debt, lending, receipts, analytics, reporting, an AI
assistant grounded on the user's own data, household sharing, and platform administration.

**Out of scope (v1):** live bank connections (Plaid/TrueLayer), investment lot-level cost
basis, tax filing, payments/settlement, mobile native apps.

## 2. Actors

| Actor | Description |
|---|---|
| **Visitor** | Unauthenticated. Sees marketing and sign-in only. |
| **User** | Owns a personal ledger. Full control over their own data. |
| **Household Owner / Admin / Member / Viewer** | Roles within a shared finance space. See [permissions.md](permissions.md). |
| **Platform Admin** | Operates the service. Sees aggregates, health and abuse signals — **never** a user's amounts, merchants, notes or attachments. |
| **System** | Scheduled jobs and automation rules acting without a human. Recorded as an actor in the audit log. |

## 3. Functional requirements

Requirements are grouped by module. Each is testable; the test that covers it is named in
[testing.md](testing.md).

### FR-1 Authentication & identity
1. Sign in with Google OAuth.
2. Sign in with email + password (Argon2id/bcrypt hash, never reversible).
3. Sessions are stored server-side and listed in Settings with device, location and last use.
4. A user can revoke any session, including all others at once.
5. Failed password attempts are rate-limited per account and per IP; 10 failures in 15 min locks sign-in for that account for 15 min.
6. Sign-in from a new device raises a security notification.
7. Account deletion removes all owned data within 30 days and is irreversible after a 7-day grace window.

### FR-2 Accounts
1. Supported types: `CASH`, `CHECKING`, `SAVINGS`, `CREDIT_CARD`, `DEBIT_CARD`, `PREPAID`, `DIGITAL_WALLET`, `INVESTMENT`, `LOAN`, `LIABILITY`, `OTHER`.
2. Each account has its own currency; it is fixed after the first transaction.
3. Credit accounts additionally carry credit limit, statement day, due day and APR.
4. Balance = opening balance + sum of signed movements. It is never edited directly; a correction is an `ADJUSTMENT` transaction.
5. Accounts are archived, not deleted, once they have transactions.
6. Net worth = Σ asset balances − Σ liability balances, converted to the base currency at today's rate.

### FR-3 Transactions
1. Types as listed in [architecture.md §4](architecture.md).
2. Required: account, type, amount (> 0), currency, occurred-at date. Everything else optional.
3. A transaction may be split across categories; splits must sum exactly to the parent amount.
4. Attachments: images and PDFs, ≤ 10 MB, MIME-sniffed.
5. Tags, note, merchant, location and an external reference are optional.
6. Status: `PENDING`, `CLEARED`, `RECONCILED`, `VOID`.
7. Every create/update/delete writes an `AuditLog` row with before/after values.
8. Deletion is soft for 30 days and restorable from the activity log.
9. A refund links to the transaction it reverses and offsets that transaction's category and period.

### FR-4 Transfers
1. A transfer writes exactly two transactions plus one `Transfer` row, in one DB transaction.
2. Cross-currency transfers store both amounts and the rate used; the rate is the transaction-date rate, editable by the user.
3. A transfer never appears in spending or income totals.
4. A payment from an asset account to a credit account is a `CREDIT_CARD_PAYMENT`, which reduces the liability and is excluded from spending.

### FR-5 Categories, merchants, tags
1. Ships with a built-in two-level category tree; users add, rename, recolour, reorder and archive.
2. Archiving preserves history and removes the category from pickers.
3. Categories can be merged; all transactions move and the audit log records it.
4. Merchants are normalised from raw descriptors; each has aliases and a default category.
5. Tags are free-form, per user, many-to-many with transactions.

### FR-6 Recurring
1. Frequencies: daily, weekly, biweekly, monthly, quarterly, yearly, custom interval.
2. Monthly schedules handle short months (31st → last day) and a weekend policy (previous/next weekday/keep).
3. Fixed or variable amount; variable estimates from the trailing 6 occurrences.
4. Pause, resume, skip one occurrence, end date, and a maximum-occurrence count.
5. Occurrences materialise as `PENDING` transactions N days ahead (default 2) and are idempotent.
6. Reminders fire per the user's notification preferences.

### FR-7 Subscriptions
1. A subscription is a recurring expense with service metadata: plan, billing cycle, trial end, renewal date, payment account.
2. Monthly-normalised and annualised cost are computed, never entered.
3. Trial-ending alerts fire at 7, 3 and 1 days.
4. "Unused" detection flags a subscription with no linked activity for 60+ days.

### FR-8 Bills
1. Fixed or estimated amount; estimates use the trailing 6-month mean.
2. States: `SCHEDULED`, `DUE`, `PAID`, `OVERDUE`, `SKIPPED`.
3. Marking paid creates the transaction and links it to the bill occurrence.
4. Overdue escalates daily until paid or dismissed.

### FR-9 Budgets
1. Periods: weekly, monthly, quarterly, annual, custom date range.
2. Overall budget and per-category budgets, with an optional per-category rollover.
3. Progress compares spend against a **pace marker** — elapsed fraction of the period.
4. Alerts at configurable thresholds (default 80% and 100%).
5. Transfers, card payments and refunds are excluded from budget spend; refunds reduce it.

### FR-10 Goals
1. Target amount, target date, linked account, contribution cadence.
2. Contributions are real transfers into the linked account, not notional numbers.
3. Milestones subdivide a goal; progress and projected completion are computed from actual contributions.

### FR-11 Debt & lending
1. Debt records: principal, APR, minimum payment, payment day, term.
2. Payments split into principal and interest using exact amortisation.
3. Payoff projection under avalanche, snowball and custom strategies, with total interest for each.
4. Lending records money lent to or borrowed from a person, with partial repayments and a write-off state.

### FR-12 Receipts
1. Upload image or PDF; type is verified by content, not extension.
2. OCR + Claude extraction produces merchant, total, tax, tip, date and line items with a confidence score.
3. The system attempts to match an existing transaction within ±3 days and ±2% of the amount.
4. Unmatched receipts offer one-tap transaction creation.
5. Extraction below 50% confidence is surfaced for manual entry rather than guessed at.

### FR-13 Multi-currency
1. Each account holds one currency; transactions may be in another, storing both amounts.
2. A base currency per user drives all reporting.
3. Conversions use the rate **on the transaction date**, fetched daily and stored historically.
4. If rates are stale, the last known rate is used and the figure is marked stale in the UI.

### FR-14 Analytics & reports
1. Cash flow, category and merchant breakdowns, net worth, savings rate, subscription cost, debt trajectory, period comparison.
2. Every figure is computed by a SQL aggregate. The AI never produces a number that is displayed as fact.
3. Reports export to CSV, XLSX, PDF and JSON; large exports are built by a job and downloaded when ready.

### FR-15 Import
1. CSV, XLSX and JSON. Delimiter, encoding and date format are detected and overridable.
2. Column mapping is user-confirmed and remembered per account.
3. Duplicate detection on `(account, date ±1 day, amount, normalised description)`.
4. Preview shows per-row outcome before commit; the commit is one DB transaction.

### FR-16 Reconciliation
1. User enters the real balance; the system shows the recorded balance and the difference.
2. Transactions are ticked off; the difference updates live.
3. Closing with a residual difference posts an `ADJUSTMENT`, or the user can close with a recorded variance.
4. Reconciliations are historical records and mark their transactions `RECONCILED`.

### FR-17 Automation rules
1. Conditions on merchant, description, amount, account, category, day-of-week, and MCC.
2. Actions: set category, set merchant, add tag, flag for review, notify, exclude from budgets.
3. Rules are ordered; the first matching action of each kind wins.
4. A dry run reports how many existing transactions a rule would match before it is saved.

### FR-18 Notifications
1. Events: bill due/overdue, budget threshold/exceeded, unusual transaction, subscription renewal, trial ending, low balance, goal milestone, recurring created, monthly summary, new sign-in.
2. Channels: in-app, push (web push), email. Per-event, per-channel preferences.
3. Quiet hours suppress non-urgent notifications. Overdue bills and security alerts ignore them.

### FR-19 Household
1. One household per user (v1). Roles: owner, admin, member, viewer.
2. Accounts and budgets are individually marked shared or private.
3. Invitations are emailed, expire in 7 days, and are single-use.
4. See the full matrix in [permissions.md](permissions.md).

### FR-20 AI
See [ai.md](ai.md). Summary: read operations run immediately; mutations require explicit
confirmation; Claude has no database access; every request records model, latency, tokens,
tool calls and outcome.

### FR-21 Administration
See [admin.md](admin.md).

## 4. Non-functional requirements

| # | Requirement | Target |
|---|---|---|
| NFR-1 | Dashboard TTFB (warm, 5k transactions) | < 400 ms |
| NFR-2 | Transaction list page (50 rows, server-filtered) | < 250 ms |
| NFR-3 | Import throughput | ≥ 2,500 rows/s |
| NFR-4 | Ledger scale per user | 500,000 transactions without query-plan change |
| NFR-5 | Financial arithmetic | exact; no floating point in any balance path |
| NFR-6 | Accessibility | WCAG 2.2 AA: contrast, focus visibility, keyboard reachability, reduced motion |
| NFR-7 | Mobile | Every surface usable at 360 px; primary actions in the thumb zone |
| NFR-8 | Availability of core ledger | independent of AI availability |
| NFR-9 | Audit completeness | every financial mutation recorded with actor and before/after |
| NFR-10 | Recovery | soft-deleted records restorable for 30 days |

## 5. Assumptions and documented decisions

1. **No bank connections in v1.** Manual entry and import cover the same ground without a
   vendor dependency, and the import path is needed regardless.
2. **One household per user.** Multi-household is a schema-compatible extension
   (`HouseholdMember` is already a join table) but adds a scope switcher to every query and
   surface; deferred deliberately.
3. **Credit-card interest is not accrued automatically.** It posts when the user records the
   statement, because accruing it would invent transactions the bank may not agree with.
4. **Investment accounts track balance, not holdings.** Lot-level cost basis is a different
   product; the account type exists so net worth is correct.
5. **Push notifications use the Web Push API**, not a native service, matching the web-only scope.
6. **AI cost is estimated** from published per-token prices held in configuration, and labelled
   as an estimate everywhere it appears.
