# Technical Architecture

SpendTrack is a full-stack Next.js 16 application. There is one deployable unit; the
"backend" is the server half of the same app.

## 1. Layering

Business logic never lives in a React component, a Route Handler, or a Server Action.
Those are transport adapters. The rule is one direction:

```
UI (Server + Client Components)
  ↓                     ↓
Server Actions      Route Handlers (/api/*)
  ↓                     ↓
        Service layer  (src/server/services/*)
                ↓
        Repository layer (src/server/repositories/*)
                ↓
        Drizzle ORM
                ↓
        PostgreSQL (Neon; Docker for local work)
```

| Layer | Owns | Never does |
|---|---|---|
| **Component** | Rendering, local UI state, optimistic updates | Query the DB, compute money, decide authorisation |
| **Action / Handler** | Parse + Zod-validate input, resolve the session, map errors to responses | Business rules, SQL |
| **Service** | Business rules, invariants, orchestration, transactions, audit writes, authorisation | Know about `Request`/`Response`/`FormData` |
| **Repository** | Drizzle queries, column selection, pagination, aggregation | Business rules, authorisation decisions |

A service receives an `ActorContext` (`{ userId, householdId?, role, isAdmin }`) as its first
argument, never a raw request. That makes every service callable from a Route Handler, a
Server Action, a background job, an AI tool, or a test with equal ease.

## 2. Directory map

```
app/                          Next.js App Router — routing and rendering only
  (marketing)/                public landing
  (auth)/signin               sign-in
  (app)/                      authenticated product shell
  admin/                      platform administration
  api/                        Route Handlers
src/
  server/
    auth/                     Auth.js config, session helpers, guards
    services/                 business logic  (one file per domain)
    repositories/             Drizzle access  (one file per aggregate)
    ai/                       context builder, tool registry, runner, usage recording
    jobs/                     scheduled work (recurring materialisation, reminders, rates)
    errors.ts                 AppError taxonomy
    db/
      index.ts                Drizzle client, pool, withTransaction
      schema.ts               tables, enums, indexes, constraints
      relations.ts            joins for the relational query API
  domain/                     pure, dependency-free logic
    money.ts                  integer-minor-unit arithmetic
    schedule.ts               recurrence expansion
    budget.ts  goal.ts  debt.ts  fx.ts
  lib/                        cross-cutting utilities (zod schemas, formatting, rate limit)
  components/                 design-system React components
drizzle/
  migrations/    seed.ts    migrate.mts    verify.mts
```

`src/domain` has **no imports from Drizzle, Next, or React**. It is the part of the system
that must be provably correct, so it is kept free of anything that needs a database to test.

## 3. Money

All monetary amounts are **integer minor units** (cents) stored as PostgreSQL `BIGINT`,
paired with an ISO-4217 `currency` column. Floating point never touches a balance.

- `src/domain/money.ts` is the only module allowed to do arithmetic on amounts.
- The schema declares money columns as `bigint({ mode: "bigint" })`, so the driver hands
  back a JS `bigint`. The default (`mode: "number"`) would return a float, which is exactly
  what the integer-minor-unit design exists to avoid.
- The serialisation boundary (`toDTO`) converts to a decimal **string**, never a JS
  `number`, so amounts survive JSON intact.
- Hand-written aggregates must cast: Postgres widens `SUM(bigint)` to `numeric` and the
  driver returns that as a string. `tests/unit/raw-sql.test.ts` enforces the cast, because
  the mismatch is invisible to `tsc` and only surfaces on a later write.
- Exchange rates are `DECIMAL(24,12)`. Conversion rounds half-up to the target currency's
  minor-unit exponent, and the rounding happens exactly once, at the end.

## 4. The ledger model

A `Transaction` is one row with a `type` and a signed `amountMinor` relative to its account.

| Type | Effect on account balance | Counts as spending | Counts as income |
|---|---|---|---|
| `EXPENSE` | − | yes | no |
| `INCOME` | + | no | yes |
| `TRANSFER_OUT` / `TRANSFER_IN` | − / + | **no** | **no** |
| `CREDIT_CARD_PAYMENT` (out) / `..._RECEIPT` (in) | − / + | **no** | **no** |
| `REFUND` | + | **negative spending in the original category** | no |
| `ADJUSTMENT` | ± | no | no |
| `LENDING_OUT` / `LENDING_REPAYMENT_IN` | − / + | no | no |
| `BORROWING_IN` / `BORROWING_REPAYMENT_OUT` | + / − | no | no |
| `DEBT_PAYMENT` | − | no (principal) / yes (interest portion) | no |

Paired movements (transfers, card payments, lending) are written as **two transactions
joined by a `Transfer` row**, inside one PostgreSQL transaction. Either both sides exist or
neither does. This is the single most important invariant in the product; it is enforced in
`TransferService` and covered by integration tests.

Balances are **derived**, not stored as mutable state:
`balance = openingBalanceMinor + Σ signed(amountMinor)`, computed with a SQL aggregate and
cached per account in `Account.cachedBalanceMinor` with `cachedBalanceAt`. The cache is
recomputed inside the same transaction that writes a movement, so it can never drift.

## 5. Rendering strategy

- Route segments under `(app)` are **dynamic** — they read the session, so they cannot be
  statically prerendered. `cacheComponents` is deliberately left off: almost every byte on
  these pages is per-user.
- The marketing surface is static.
- Read paths render in Server Components that call services directly (no HTTP hop).
- Write paths use Server Actions for form-shaped mutations and Route Handlers for anything
  a non-browser client needs (AI tools, exports, webhooks, uploads).
- Long lists stream: a Server Component renders the first page, a Client Component
  virtualises and fetches subsequent pages from `/api/transactions`.

## 6. Error handling

`src/server/errors.ts` defines a closed set: `ValidationError`, `NotFoundError`,
`ForbiddenError`, `UnauthorizedError`, `ConflictError`, `RateLimitError`,
`UpstreamError`, `InternalError`. Every one carries a stable `code`, an HTTP status, and a
**user-facing message that is safe to render**. Route Handlers and Actions map them through
one function; raw exceptions become `InternalError` with a generated incident id that is
logged server-side and shown to the user as a reference only.

## 7. Authorisation

Two checks, always both:

1. **Authentication** — `requireUser()` in a layout/handler; `proxy.ts` additionally
   redirects unauthenticated navigation away from `(app)` and `/admin` before render.
2. **Ownership** — every repository read/write for a user-owned entity takes `userId` and
   filters on it in the `WHERE` clause. There is no "fetch then check" pattern, because
   fetch-then-check leaks existence through timing and error shape.

Household sharing adds a third: `resolveScope(actor, resource)` returns the set of user ids
the actor may read, based on `HouseholdMember.role` and the resource's `visibility`.

## 8. AI boundary

Claude never touches the database. The flow is:

```
user message
  → ContextBuilder      (assembles only what this actor may see)
  → PermissionFilter    (strips fields the actor's role cannot read)
  → Claude (tool definitions + system prompt)
  → tool call
  → ToolRegistry: schema validation (Zod)
  → ownership re-validation of every id the model produced
  → mutating? → proposal returned to the UI for explicit confirmation
  → service layer (the same one the UI uses)
  → database
```

Read tools execute immediately. Mutating tools return a **proposal**, persisted as
`AIToolCall.status = 'PROPOSED'`, and only execute after the user confirms — unless the user
has enabled a specific, named automation. Model-supplied ids are treated as untrusted input
and re-resolved against the actor's scope before use. Full detail in [ai.md](ai.md).

## 9. Background work

`src/server/jobs` holds idempotent job functions. Each is exposed at
`POST /api/jobs/<name>` behind a shared-secret header so any scheduler (Vercel Cron, GitHub
Actions, a container cron) can drive them. Every run records a `SystemEvent` with duration
and outcome; the admin System page reads those.

| Job | Cadence | Idempotency key |
|---|---|---|
| `recurring-materialise` | 15 min | `(recurringId, dueDate)` unique index |
| `bill-reminders` | hourly | `(billId, occurrenceDate, kind)` on Notification |
| `exchange-rate-sync` | 6 h | `(base, quote, date)` unique index |
| `budget-alerts` | 30 min | `(budgetId, periodStart, threshold)` |
| `anomaly-scan` | hourly | `(transactionId)` |
| `retention-sweep` | daily | date-bounded delete |

## 10. Performance

- Composite indexes on every query shape the app actually issues — see [database.md](database.md).
- Lists are keyset-paginated (`(occurredAt, id)` cursor), never `OFFSET`.
- Totals come from SQL aggregates, never from loading rows into JS.
- `select` is always explicit; no `include` fan-out that would fetch unused columns.
- The transaction list virtualises above 100 rows.
- Charts and the AI panel are `next/dynamic` with a skeleton.

## 11. Decisions and their reasons

| Decision | Why | Rejected alternative |
|---|---|---|
| Integer minor units | Exact, deterministic, no float drift | `Decimal` — correct but pushes decimal.js into every layer |
| Derived balances with a recomputed cache | Cannot drift; still O(1) to read | Mutable running balance — drifts after any failed write |
| Database sessions | Lets users list and revoke sessions, which the spec requires | JWT — no server-side revocation |
| Two rows per transfer | Each account's ledger is complete on its own | One row with two account ids — breaks per-account queries |
| Proposal/confirm for AI writes | The model proposes, the person commits | Direct tool execution — unrecoverable if the model is wrong |
| `cacheComponents` off | Every page is per-user; PPR buys little and complicates auth | PPR everywhere |
