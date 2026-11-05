import { and, desc, eq, isNull } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import { accounts, debtPayments, debts } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as audit from "./audit-service";
import * as transferService from "./transfer-service";
import { money, toDTO, zero, type MoneyDTO } from "@/src/domain/money";
import {
  type DebtInput,
  type PayoffStrategy,
  amortise,
  monthlyInterest,
  simulateStrategy,
  splitPayment,
  totalMinimum,
  weightedApr,
} from "@/src/domain/debt";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type { CreateDebtInput } from "@/src/lib/schemas";
import * as z from "zod";
import type { recordDebtPaymentSchema } from "@/src/lib/schemas";

/**
 * Debt.
 *
 * Payments split into principal and interest using exact integer arithmetic, so
 * a payment history sums back to the original principal to the cent. The payoff
 * projections are simulations over that same arithmetic — nothing here is
 * estimated, and nothing here comes from a model.
 */

export interface DebtDTO {
  id: string;
  name: string;
  kind: string;
  currency: string;
  principal: MoneyDTO;
  balance: MoneyDTO;
  paid: MoneyDTO;
  paidFraction: number;
  aprBps: number;
  aprPercent: number;
  minimumPayment: MoneyDTO;
  monthlyInterest: MoneyDTO;
  paymentDay: number | null;
  termMonths: number | null;
  startedOn: string;
  status: string;
  linkedAccountId: string | null;
  paymentCount: number;
  /** Where this debt lands paying only the minimum. Null if it never clears. */
  minimumPayoff: { months: number; totalInterest: MoneyDTO; payoffDate: string } | null;
}

/**
 * Turn a loaded debt into what `toDto` wants: the payment count, derived from
 * the ids rather than a second query.
 */
function shape<T extends { debtPayments: Array<{ id: string }> }>(row: T) {
  const { debtPayments: paid, ...rest } = row;
  return { ...rest, _count: { payments: paid.length } };
}

function toDto(row: {
  id: string; name: string; kind: string; currency: string;
  principalMinor: bigint; currentBalanceMinor: bigint; aprBps: number;
  minimumPaymentMinor: bigint; paymentDay: number | null; termMonths: number | null;
  startedOn: Date; status: string; linkedAccountId: string | null;
  _count: { payments: number };
}): DebtDTO {
  const balance = money(row.currentBalanceMinor, row.currency);
  const principal = money(row.principalMinor, row.currency);
  const paid = money(principal.minor - balance.minor, row.currency);

  const input: DebtInput = {
    id: row.id,
    name: row.name,
    balance,
    aprBps: row.aprBps,
    minimumPayment: money(row.minimumPaymentMinor, row.currency),
  };
  const minimumPayoff = amortise(input, input.minimumPayment, new Date());

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    principal: toDTO(principal),
    balance: toDTO(balance),
    paid: toDTO(paid),
    paidFraction: principal.minor > 0n ? Math.min(1, Number(paid.minor) / Number(principal.minor)) : 0,
    aprBps: row.aprBps,
    aprPercent: row.aprBps / 100,
    minimumPayment: toDTO(input.minimumPayment),
    monthlyInterest: toDTO(monthlyInterest(balance, row.aprBps)),
    paymentDay: row.paymentDay,
    termMonths: row.termMonths,
    startedOn: row.startedOn.toISOString(),
    status: row.status,
    linkedAccountId: row.linkedAccountId,
    paymentCount: row._count.payments,
    minimumPayoff: minimumPayoff
      ? {
          months: minimumPayoff.months,
          totalInterest: toDTO(minimumPayoff.totalInterest),
          payoffDate: minimumPayoff.payoffDate.toISOString(),
        }
      : null,
  };
}

export async function list(actor: ActorContext, options: { includeClosed?: boolean } = {}, db: Db = rootDb): Promise<DebtDTO[]> {
  const rows = await db.query.debts.findMany({
    where: and(
      eq(debts.userId, actor.userId),
      isNull(debts.deletedAt),
      options.includeClosed ? undefined : eq(debts.status, "ACTIVE"),
    ),
    orderBy: [desc(debts.aprBps), desc(debts.currentBalanceMinor)],
    with: {
      debtPayments: { columns: { id: true } },
    },
  });
  return rows.map((r) => toDto(shape(r)));
}

export async function get(actor: ActorContext, id: string, db: Db = rootDb): Promise<DebtDTO> {
  const row = await db.query.debts.findFirst({
    where: and(eq(debts.id, id), eq(debts.userId, actor.userId), isNull(debts.deletedAt)),
    with: {
      debtPayments: { columns: { id: true } },
    },
  });
  if (!row) throw new NotFoundError("That debt");
  return toDto(shape(row));
}

export async function create(actor: ActorContext, input: CreateDebtInput): Promise<DebtDTO> {
  const principalMinor = parseAmountForCurrency(input.principal, input.currency, actor.locale);
  const balanceMinor = input.currentBalance
    ? parseAmountForCurrency(input.currentBalance, input.currency, actor.locale)
    : principalMinor;
  const minimumMinor = parseAmountForCurrency(input.minimumPayment, input.currency, actor.locale);

  if (principalMinor <= 0n) throw new ValidationError("Enter a principal above zero.");
  if (minimumMinor <= 0n) throw new ValidationError("Enter a minimum payment above zero.");

  // A minimum that cannot cover the interest means the balance grows forever.
  // Better to say so now than to draw a payoff chart that never ends.
  const interest = monthlyInterest(money(balanceMinor, input.currency), input.aprBps);
  if (minimumMinor <= interest.minor) {
    throw new ValidationError(
      `At ${(input.aprBps / 100).toFixed(2)}% APR this balance accrues ${toDTO(interest).decimal} ${input.currency} of interest a month. The minimum payment has to be more than that.`,
      [{ path: "minimumPayment", message: "Too low to ever clear the balance." }],
    );
  }

  return withTransaction(rootDb, async (tx) => {
    if (input.linkedAccountId) {
      const account = await tx.query.accounts.findFirst({
        where: and(
          eq(accounts.id, input.linkedAccountId),
          eq(accounts.userId, actor.userId),
          isNull(accounts.deletedAt),
        ),
        columns: { id: true },
      });
      if (!account) throw new NotFoundError("That account");
    }

    const [inserted] = await tx
      .insert(debts)
      .values({
        userId: actor.userId,
        name: input.name,
        kind: input.kind,
        principalMinor,
        currentBalanceMinor: balanceMinor,
        currency: input.currency,
        aprBps: input.aprBps,
        minimumPaymentMinor: minimumMinor,
        paymentDay: input.paymentDay,
        termMonths: input.termMonths,
        startedOn: input.startedOn,
        linkedAccountId: input.linkedAccountId,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That debt");
    const debt = { ...inserted, debtPayments: [] as Array<{ id: string }> };

    await audit.record(
      actor,
      { action: "debt.create", entityType: "Debt", entityId: debt.id, after: { name: debt.name, principalMinor, aprBps: debt.aprBps } },
      tx,
    );
    return toDto(shape(debt));
  });
}

export async function update(actor: ActorContext, id: string, input: Partial<CreateDebtInput> & { status?: string }): Promise<DebtDTO> {
  const before = await rootDb.query.debts.findFirst({
    where: and(eq(debts.id, id), eq(debts.userId, actor.userId), isNull(debts.deletedAt)),
    with: {
      debtPayments: { columns: { id: true } },
    },
  });
  if (!before) throw new NotFoundError("That debt");

  const [afterRow] = await rootDb
    .update(debts)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.aprBps !== undefined ? { aprBps: input.aprBps } : {}),
      ...(input.minimumPayment !== undefined
        ? { minimumPaymentMinor: parseAmountForCurrency(input.minimumPayment, before.currency, actor.locale) }
        : {}),
      ...(input.currentBalance !== undefined
        ? { currentBalanceMinor: parseAmountForCurrency(input.currentBalance, before.currency, actor.locale) }
        : {}),
      ...(input.paymentDay !== undefined ? { paymentDay: input.paymentDay } : {}),
      ...(input.termMonths !== undefined ? { termMonths: input.termMonths } : {}),
      ...(input.linkedAccountId !== undefined ? { linkedAccountId: input.linkedAccountId } : {}),
      ...(input.status !== undefined
        ? { status: input.status as never, closedAt: input.status === "ACTIVE" ? null : new Date() }
        : {}),
    })
    .where(and(eq(debts.id, id), eq(debts.userId, actor.userId)))
    .returning();
  if (!afterRow) throw new NotFoundError("That debt");
  const after = { ...afterRow, debtPayments: before.debtPayments };

  await audit.record(actor, {
    action: "debt.update",
    entityType: "Debt",
    entityId: id,
    before: { name: before.name, aprBps: before.aprBps, currentBalanceMinor: before.currentBalanceMinor },
    after: { name: after.name, aprBps: after.aprBps, currentBalanceMinor: after.currentBalanceMinor },
  });
  return toDto(shape(after));
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.debts.findFirst({
    where: and(eq(debts.id, id), eq(debts.userId, actor.userId), isNull(debts.deletedAt)),
  });
  if (!before) throw new NotFoundError("That debt");
  await rootDb
    .update(debts)
    .set({ deletedAt: new Date() })
    .where(and(eq(debts.id, id), eq(debts.userId, actor.userId)));
  await audit.record(actor, { action: "debt.delete", entityType: "Debt", entityId: id, before });
}

/**
 * Record a payment. The principal/interest split is computed here, not entered,
 * and the balance moves by the principal portion only.
 */
export async function recordPayment(
  actor: ActorContext,
  input: z.infer<typeof recordDebtPaymentSchema>,
): Promise<{ debt: DebtDTO; payment: { id: string; principal: MoneyDTO; interest: MoneyDTO; balanceAfter: MoneyDTO }; transactionId: string | null; clearedDebt: boolean }> {
  return withTransaction(rootDb, async (tx) => {
    const debt = await tx.query.debts.findFirst({
      where: and(
        eq(debts.id, input.debtId),
        eq(debts.userId, actor.userId),
        isNull(debts.deletedAt),
      ),
      with: {
      debtPayments: { columns: { id: true } },
    },
    });
    if (!debt) throw new NotFoundError("That debt");
    if (debt.status !== "ACTIVE") throw new ValidationError("That debt is already closed.");

    const amountMinor = parseAmountForCurrency(input.amount, debt.currency, actor.locale);
    if (amountMinor <= 0n) throw new ValidationError("Enter an amount above zero.");

    const balance = money(debt.currentBalanceMinor, debt.currency);
    const split = splitPayment(balance, debt.aprBps, money(amountMinor, debt.currency));

    const [payment] = await tx
      .insert(debtPayments)
      .values({
        debtId: debt.id,
        amountMinor,
        principalMinor: split.principal.minor,
        interestMinor: split.interest.minor,
        balanceAfterMinor: split.balanceAfter.minor,
        occurredAt: input.occurredAt,
        note: input.note,
      })
      .returning({ id: debtPayments.id });
    if (!payment) throw new NotFoundError("That debt");

    let transactionId: string | null = null;
    if (input.fromAccountId && debt.linkedAccountId) {
      const transfer = await transferService.create(
        actor,
        {
          fromAccountId: input.fromAccountId,
          toAccountId: debt.linkedAccountId,
          amount: input.amount,
          occurredAt: input.occurredAt,
          note: input.note ?? `Payment to ${debt.name}`,
        },
        { kindHint: "DEBT_PAYMENT", debtPaymentId: payment.id, db: tx },
      );
      transactionId = transfer.outTransactionId;
      await tx
        .update(debtPayments)
        .set({ transactionId })
        .where(eq(debtPayments.id, payment.id));
    }

    const cleared = split.balanceAfter.minor <= 0n;
    const [updatedRow] = await tx
      .update(debts)
      .set({
        currentBalanceMinor: split.balanceAfter.minor,
        ...(cleared ? { status: "PAID_OFF" as const, closedAt: new Date() } : {}),
      })
      .where(and(eq(debts.id, debt.id), eq(debts.userId, actor.userId)))
      .returning();
    if (!updatedRow) throw new NotFoundError("That debt");
    const updated = { ...updatedRow, debtPayments: debt.debtPayments };

    await audit.record(
      actor,
      {
        action: "debt.payment",
        entityType: "Debt",
        entityId: debt.id,
        before: { currentBalanceMinor: debt.currentBalanceMinor },
        after: {
          currentBalanceMinor: split.balanceAfter.minor,
          principalMinor: split.principal.minor,
          interestMinor: split.interest.minor,
        },
      },
      tx,
    );

    return {
      debt: toDto(shape(updated)),
      payment: {
        id: payment.id,
        principal: toDTO(split.principal),
        interest: toDTO(split.interest),
        balanceAfter: toDTO(split.balanceAfter),
      },
      transactionId,
      clearedDebt: cleared,
    };
  });
}

export async function payments(actor: ActorContext, debtId: string, limit = 60) {
  const debt = await rootDb.query.debts.findFirst({
    where: and(eq(debts.id, debtId), eq(debts.userId, actor.userId), isNull(debts.deletedAt)),
    columns: { currency: true },
  });
  if (!debt) throw new NotFoundError("That debt");

  const rows = await rootDb.query.debtPayments.findMany({
    where: eq(debtPayments.debtId, debtId),
    orderBy: [desc(debtPayments.occurredAt)],
    limit,
  });

  return rows.map((r) => ({
    id: r.id,
    amount: toDTO(money(r.amountMinor, debt.currency)),
    principal: toDTO(money(r.principalMinor, debt.currency)),
    interest: toDTO(money(r.interestMinor, debt.currency)),
    balanceAfter: toDTO(money(r.balanceAfterMinor, debt.currency)),
    occurredAt: r.occurredAt.toISOString(),
    note: r.note,
    transactionId: r.transactionId,
  }));
}

export interface PayoffPlanDTO {
  strategy: PayoffStrategy;
  monthlyBudget: MoneyDTO;
  months: number;
  payoffDate: string;
  totalInterest: MoneyDTO;
  totalPaid: MoneyDTO;
  order: Array<{ id: string; name: string; months: number; interest: MoneyDTO }>;
}

/**
 * Compare payoff strategies at a given monthly budget.
 *
 * Returning all three lets the UI say "snowball costs $412 more but clears one
 * account four months sooner", which is the actual trade-off — one is cheaper,
 * the other is more motivating, and that is the user's call, not ours.
 */
export async function payoffPlans(
  actor: ActorContext,
  monthlyBudgetInput?: string,
  customOrder: string[] = [],
): Promise<{ plans: PayoffPlanDTO[]; minimumRequired: MoneyDTO; weightedAprBps: number; totalBalance: MoneyDTO }> {
  const rows = await rootDb.query.debts.findMany({
    where: and(
      eq(debts.userId, actor.userId),
      isNull(debts.deletedAt),
      eq(debts.status, "ACTIVE"),
    ),
    with: {
      debtPayments: { columns: { id: true } },
    },
  });

  const currency = rows[0]?.currency ?? actor.baseCurrency;
  const inputs: DebtInput[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    balance: money(d.currentBalanceMinor, d.currency),
    aprBps: d.aprBps,
    minimumPayment: money(d.minimumPaymentMinor, d.currency),
  }));

  const minimum = totalMinimum(inputs, currency);
  const budget = monthlyBudgetInput
    ? money(parseAmountForCurrency(monthlyBudgetInput, currency, actor.locale), currency)
    : minimum;

  const totalBalance = inputs.reduce((acc, d) => acc + d.balance.minor, 0n);

  const plans: PayoffPlanDTO[] = [];
  for (const strategy of ["AVALANCHE", "SNOWBALL", ...(customOrder.length ? (["CUSTOM"] as const) : [])] as PayoffStrategy[]) {
    const result = simulateStrategy(inputs, budget, strategy, customOrder);
    if (!result) continue;
    plans.push({
      strategy,
      monthlyBudget: toDTO(budget),
      months: result.months,
      payoffDate: result.payoffDate.toISOString(),
      totalInterest: toDTO(result.totalInterest),
      totalPaid: toDTO(result.totalPaid),
      order: result.perDebt.map((d) => ({
        id: d.id,
        name: d.name,
        months: d.months,
        interest: toDTO(d.interest),
      })),
    });
  }

  return {
    plans,
    minimumRequired: toDTO(minimum),
    weightedAprBps: weightedApr(inputs),
    totalBalance: toDTO(money(totalBalance, currency)),
  };
}

export { zero };
