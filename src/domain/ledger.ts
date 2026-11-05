/**
 * Ledger semantics — what each transaction type *means*.
 *
 * This is the financial-integrity core of the product. Get it wrong and a
 * transfer inflates your spending, a credit-card payment double-counts every
 * charge on that card, and a refund never reduces the category it came from.
 *
 * Everything here is a pure lookup or a pure function of a transaction shape,
 * so it can be asserted exhaustively in tests without a database.
 */

export type TransactionType =
  | "EXPENSE"
  | "INCOME"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "CREDIT_CARD_PAYMENT"
  | "CREDIT_CARD_RECEIPT"
  | "REFUND"
  | "REIMBURSEMENT"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "ADJUSTMENT"
  | "DEBT_PAYMENT"
  | "LENDING_OUT"
  | "LENDING_REPAYMENT_IN"
  | "BORROWING_IN"
  | "BORROWING_REPAYMENT_OUT"
  | "GOAL_CONTRIBUTION"
  | "FEE"
  | "INTEREST"
  | "DIVIDEND";

export interface LedgerSemantics {
  /** +1 increases the account balance, −1 decreases it. */
  direction: 1 | -1;
  /** Counts toward "money out" / spending analytics and budgets. */
  isSpending: boolean;
  /** Counts toward "money in" / income analytics. */
  isIncome: boolean;
  /** Part of a two-sided movement joined by a Transfer row. */
  isPaired: boolean;
  /** Reduces spending in the category it points at, rather than adding income. */
  isReversal: boolean;
  /** Requires a category to be meaningful in reports. */
  needsCategory: boolean;
  /** Human label used in the UI and in AI output. */
  label: string;
}

/**
 * The table. Every rule the product relies on is visible in one place, which
 * is the point — a rule buried in a query is a rule that gets contradicted by
 * the next query someone writes.
 */
export const SEMANTICS: Readonly<Record<TransactionType, LedgerSemantics>> = {
  EXPENSE: {
    direction: -1, isSpending: true, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: true, label: "Expense",
  },
  INCOME: {
    direction: 1, isSpending: false, isIncome: true, isPaired: false,
    isReversal: false, needsCategory: true, label: "Income",
  },

  // Moving your own money changes no totals. This is the rule most trackers break.
  TRANSFER_OUT: {
    direction: -1, isSpending: false, isIncome: false, isPaired: true,
    isReversal: false, needsCategory: false, label: "Transfer out",
  },
  TRANSFER_IN: {
    direction: 1, isSpending: false, isIncome: false, isPaired: true,
    isReversal: false, needsCategory: false, label: "Transfer in",
  },

  // Paying a card settles a liability. The spending already happened when the
  // card was charged; counting the payment too would double every purchase.
  CREDIT_CARD_PAYMENT: {
    direction: -1, isSpending: false, isIncome: false, isPaired: true,
    isReversal: false, needsCategory: false, label: "Card payment",
  },
  CREDIT_CARD_RECEIPT: {
    direction: 1, isSpending: false, isIncome: false, isPaired: true,
    isReversal: false, needsCategory: false, label: "Card payment received",
  },

  // A refund is negative spending in the original category and period — not
  // income. Treating it as income inflates both sides of the cash-flow chart.
  REFUND: {
    direction: 1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: true, needsCategory: true, label: "Refund",
  },
  REIMBURSEMENT: {
    direction: 1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: true, needsCategory: true, label: "Reimbursement",
  },

  DEPOSIT: {
    direction: 1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Deposit",
  },
  WITHDRAWAL: {
    direction: -1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Withdrawal",
  },

  // Corrections are not spending; they exist so a reconciliation can close.
  ADJUSTMENT: {
    direction: 1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Adjustment",
  },

  // Principal repays a liability; the interest portion is recorded separately
  // as a FEE/INTEREST transaction when the user records the split.
  DEBT_PAYMENT: {
    direction: -1, isSpending: false, isIncome: false, isPaired: true,
    isReversal: false, needsCategory: false, label: "Debt payment",
  },

  LENDING_OUT: {
    direction: -1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Money lent",
  },
  LENDING_REPAYMENT_IN: {
    direction: 1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Repayment received",
  },
  BORROWING_IN: {
    direction: 1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Money borrowed",
  },
  BORROWING_REPAYMENT_OUT: {
    direction: -1, isSpending: false, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: false, label: "Repayment made",
  },

  GOAL_CONTRIBUTION: {
    direction: -1, isSpending: false, isIncome: false, isPaired: true,
    isReversal: false, needsCategory: false, label: "Goal contribution",
  },

  FEE: {
    direction: -1, isSpending: true, isIncome: false, isPaired: false,
    isReversal: false, needsCategory: true, label: "Fee",
  },
  INTEREST: {
    direction: 1, isSpending: false, isIncome: true, isPaired: false,
    isReversal: false, needsCategory: true, label: "Interest",
  },
  DIVIDEND: {
    direction: 1, isSpending: false, isIncome: true, isPaired: false,
    isReversal: false, needsCategory: true, label: "Dividend",
  },
};

export const semanticsOf = (type: TransactionType): LedgerSemantics => SEMANTICS[type];

export const directionOf = (type: TransactionType): 1 | -1 => SEMANTICS[type].direction;

/** Types that move money out of the account, for filter chips and queries. */
export const OUTFLOW_TYPES = (Object.keys(SEMANTICS) as TransactionType[]).filter(
  (t) => SEMANTICS[t].direction === -1,
);
export const INFLOW_TYPES = (Object.keys(SEMANTICS) as TransactionType[]).filter(
  (t) => SEMANTICS[t].direction === 1,
);

/** Types that count as spending. The canonical filter for budgets and analytics. */
export const SPENDING_TYPES = (Object.keys(SEMANTICS) as TransactionType[]).filter(
  (t) => SEMANTICS[t].isSpending,
);
export const INCOME_TYPES = (Object.keys(SEMANTICS) as TransactionType[]).filter(
  (t) => SEMANTICS[t].isIncome,
);
export const REVERSAL_TYPES = (Object.keys(SEMANTICS) as TransactionType[]).filter(
  (t) => SEMANTICS[t].isReversal,
);
export const PAIRED_TYPES = (Object.keys(SEMANTICS) as TransactionType[]).filter(
  (t) => SEMANTICS[t].isPaired,
);

/**
 * Signed contribution to a **spending** total.
 *
 * Spending is not "the sum of outflows": a refund must subtract from it, and a
 * transfer must not touch it. Callers pass a positive magnitude; this returns
 * the signed value to accumulate.
 */
export function spendingDelta(type: TransactionType, amountMinor: bigint): bigint {
  const s = SEMANTICS[type];
  if (s.isSpending) return amountMinor;
  if (s.isReversal) return -amountMinor;
  return 0n;
}

/** Signed contribution to an **income** total. */
export function incomeDelta(type: TransactionType, amountMinor: bigint): bigint {
  return SEMANTICS[type].isIncome ? amountMinor : 0n;
}

/** Signed contribution to an account **balance**. */
export function balanceDelta(type: TransactionType, amountMinor: bigint): bigint {
  return SEMANTICS[type].direction === 1 ? amountMinor : -amountMinor;
}

/* --------------------------------------------------------- pair resolution */

export type PairKind = "TRANSFER" | "CREDIT_CARD_PAYMENT" | "GOAL_CONTRIBUTION" | "DEBT_PAYMENT" | "LENDING";

export interface AccountShape {
  id: string;
  type:
    | "CASH" | "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "DEBIT_CARD" | "PREPAID"
    | "DIGITAL_WALLET" | "INVESTMENT" | "LOAN" | "LIABILITY" | "OTHER";
}

export const LIABILITY_ACCOUNT_TYPES = new Set(["CREDIT_CARD", "LOAN", "LIABILITY"]);

export const isLiabilityAccount = (a: AccountShape): boolean =>
  LIABILITY_ACCOUNT_TYPES.has(a.type);

/**
 * Decide what a movement between two accounts actually *is*.
 *
 * Users say "transfer" for both "checking → savings" and "checking → Amex", but
 * those are different financial events. Inferring the kind from the account
 * types means the user never has to know the distinction, and analytics stay
 * correct either way.
 */
export function classifyPair(
  from: AccountShape,
  to: AccountShape,
  hint?: PairKind,
): { kind: PairKind; outType: TransactionType; inType: TransactionType } {
  if (hint === "GOAL_CONTRIBUTION") {
    return { kind: hint, outType: "GOAL_CONTRIBUTION", inType: "TRANSFER_IN" };
  }
  if (hint === "LENDING") {
    return { kind: hint, outType: "LENDING_OUT", inType: "TRANSFER_IN" };
  }

  const toIsLiability = isLiabilityAccount(to);
  const fromIsLiability = isLiabilityAccount(from);

  // Paying down a card or loan from an asset account.
  if (toIsLiability && !fromIsLiability) {
    const kind: PairKind = to.type === "CREDIT_CARD" ? "CREDIT_CARD_PAYMENT" : "DEBT_PAYMENT";
    return {
      kind,
      outType: kind === "CREDIT_CARD_PAYMENT" ? "CREDIT_CARD_PAYMENT" : "DEBT_PAYMENT",
      inType: "CREDIT_CARD_RECEIPT",
    };
  }

  // Drawing cash from a credit line — this increases what you owe.
  if (fromIsLiability && !toIsLiability) {
    return { kind: "TRANSFER", outType: "TRANSFER_OUT", inType: "TRANSFER_IN" };
  }

  return { kind: "TRANSFER", outType: "TRANSFER_OUT", inType: "TRANSFER_IN" };
}

/* ------------------------------------------------------------- validation */

export interface TransactionShape {
  type: TransactionType;
  amountMinor: bigint;
  categoryId?: string | null;
  transferId?: string | null;
  reversesTransactionId?: string | null;
  splits?: ReadonlyArray<{ amountMinor: bigint }>;
}

export interface LedgerViolation {
  code: string;
  message: string;
}

/**
 * Structural invariants that must hold for any transaction before it is
 * written. These are checked in the service layer, not the database, because
 * they need to produce a message a person can act on.
 */
export function validate(txn: TransactionShape): LedgerViolation[] {
  const problems: LedgerViolation[] = [];
  const s = SEMANTICS[txn.type];

  if (txn.amountMinor <= 0n) {
    problems.push({
      code: "AMOUNT_NOT_POSITIVE",
      message: "Amount must be greater than zero. Direction is set by the transaction type.",
    });
  }

  if (s.isPaired && !txn.transferId) {
    problems.push({
      code: "PAIR_MISSING",
      message: `A ${s.label.toLowerCase()} must be written as both halves of a transfer.`,
    });
  }

  if (!s.isPaired && txn.transferId) {
    problems.push({
      code: "PAIR_UNEXPECTED",
      message: `A ${s.label.toLowerCase()} cannot belong to a transfer.`,
    });
  }

  if (s.isReversal && !txn.reversesTransactionId && !txn.categoryId) {
    problems.push({
      code: "REVERSAL_UNANCHORED",
      message: "A refund needs either the original transaction or a category, so the offset lands somewhere.",
    });
  }

  if (txn.splits && txn.splits.length > 0) {
    const total = txn.splits.reduce((acc, sp) => acc + sp.amountMinor, 0n);
    if (total !== txn.amountMinor) {
      problems.push({
        code: "SPLIT_MISMATCH",
        message: "Splits must add up to the transaction total exactly.",
      });
    }
    if (txn.splits.length === 1) {
      problems.push({
        code: "SPLIT_TRIVIAL",
        message: "A split needs at least two parts.",
      });
    }
  }

  return problems;
}

/**
 * Sign convention for balances — stated once, relied on everywhere.
 *
 * Every account balance is signed in the ordinary sense: money in is positive,
 * money out is negative. A credit card you owe $2,860 on has a balance of
 * **−286000**. There is no per-account-type sign flip anywhere in the ledger,
 * which removes the entire class of bug where a liability is negated twice (or
 * not at all) and net worth comes out wrong by double the card balance.
 *
 * `abs()` happens only at the display layer, where "you owe $2,860.40" is what
 * a person recognises from their statement.
 */
export function netWorthDelta(_account: AccountShape, balanceMinor: bigint): bigint {
  return balanceMinor;
}

/** The positive "amount owed" figure a statement shows, for display only. */
export function owedAmount(account: AccountShape, balanceMinor: bigint): bigint {
  if (!isLiabilityAccount(account)) return balanceMinor;
  return balanceMinor < 0n ? -balanceMinor : 0n;
}

/** How a list should sign and colour an amount. */
export type AmountSign = "always" | "never" | "explicit-minus";
export type AmountTone = "inflow" | "transfer" | "default";

/**
 * Decide the sign and tone for a transaction amount.
 *
 * `amountMinor` is stored as a positive magnitude — the ledger keeps which way
 * the money went in `direction` — so every list has to re-apply the sign when
 * it renders. Doing that from `isIncome` is the trap this function exists to
 * close: a refund is *not* income (it reverses spending rather than adding to
 * earnings), so an `isIncome ? "+" : "−"` test falls through to the minus and
 * shows −$32.08 for £32.08 that came back to the user. Direction is the only
 * field that answers the question being asked.
 *
 * Kept here rather than in a component because four different screens render
 * transaction amounts, and a rule about what money did belongs in one place.
 */
export function presentAmount(txn: {
  direction: number;
  isIncome: boolean;
  isTransfer: boolean;
}): { sign: AmountSign; tone: AmountTone } {
  // Both legs of a transfer or a card payment move the user's own money between
  // their own accounts. A sign there would claim a gain or a loss that did not
  // happen.
  if (txn.isTransfer) return { sign: "never", tone: "transfer" };

  if (txn.direction > 0) {
    // The inflow tone is reserved for money the user actually earned. A refund
    // reads "+$32.08" in ordinary ink, which is what it is.
    return { sign: "always", tone: txn.isIncome ? "inflow" : "default" };
  }

  return { sign: "explicit-minus", tone: "default" };
}
