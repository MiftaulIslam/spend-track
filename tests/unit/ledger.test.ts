import { describe, expect, it } from "vitest";
import {
  type AccountShape,
  INCOME_TYPES,
  SEMANTICS,
  SPENDING_TYPES,
  type TransactionType,
  balanceDelta,
  classifyPair,
  incomeDelta,
  isLiabilityAccount,
  netWorthDelta,
  owedAmount,
  presentAmount,
  semanticsOf,
  spendingDelta,
  validate,
} from "@/src/domain/ledger";

const ALL = Object.keys(SEMANTICS) as TransactionType[];

describe("ledger semantics", () => {
  it("gives every type a direction of exactly +1 or -1", () => {
    for (const t of ALL) expect([1, -1]).toContain(SEMANTICS[t].direction);
  });

  it("never marks a type as both spending and income", () => {
    for (const t of ALL) {
      expect(SEMANTICS[t].isSpending && SEMANTICS[t].isIncome).toBe(false);
    }
  });

  it("keeps transfers out of both spending and income", () => {
    // This is the single rule most expense trackers get wrong.
    const transferish: TransactionType[] = [
      "TRANSFER_OUT", "TRANSFER_IN",
      "CREDIT_CARD_PAYMENT", "CREDIT_CARD_RECEIPT",
      "GOAL_CONTRIBUTION", "DEBT_PAYMENT",
    ];
    for (const t of transferish) {
      expect(SEMANTICS[t].isSpending, `${t} must not be spending`).toBe(false);
      expect(SEMANTICS[t].isIncome, `${t} must not be income`).toBe(false);
    }
  });

  it("keeps lending and borrowing out of income and spending", () => {
    // Borrowing money is not income; lending it is not an expense. Both are
    // balance-sheet movements.
    for (const t of ["LENDING_OUT", "LENDING_REPAYMENT_IN", "BORROWING_IN", "BORROWING_REPAYMENT_OUT"] as TransactionType[]) {
      expect(SEMANTICS[t].isSpending).toBe(false);
      expect(SEMANTICS[t].isIncome).toBe(false);
    }
  });

  it("treats refunds as negative spending, never as income", () => {
    expect(SEMANTICS.REFUND.isIncome).toBe(false);
    expect(SEMANTICS.REFUND.isReversal).toBe(true);
    expect(spendingDelta("REFUND", 12_900n)).toBe(-12_900n);
    expect(incomeDelta("REFUND", 12_900n)).toBe(0n);
  });

  it("has a small, deliberate spending set", () => {
    expect(SPENDING_TYPES.sort()).toEqual(["EXPENSE", "FEE"].sort());
    expect(INCOME_TYPES.sort()).toEqual(["DIVIDEND", "INCOME", "INTEREST"].sort());
  });
});

describe("deltas", () => {
  it("signs the balance by direction", () => {
    expect(balanceDelta("EXPENSE", 1000n)).toBe(-1000n);
    expect(balanceDelta("INCOME", 1000n)).toBe(1000n);
    expect(balanceDelta("TRANSFER_OUT", 1000n)).toBe(-1000n);
    expect(balanceDelta("TRANSFER_IN", 1000n)).toBe(1000n);
  });

  it("nets a transfer to zero across both accounts", () => {
    const out = balanceDelta("TRANSFER_OUT", 50_000n);
    const inn = balanceDelta("TRANSFER_IN", 50_000n);
    expect(out + inn).toBe(0n);
    expect(spendingDelta("TRANSFER_OUT", 50_000n) + spendingDelta("TRANSFER_IN", 50_000n)).toBe(0n);
  });

  it("does not let a card payment double-count spending", () => {
    // $100 charged to the card, then $100 paid off from checking.
    const charged = spendingDelta("EXPENSE", 10_000n);
    const paid = spendingDelta("CREDIT_CARD_PAYMENT", 10_000n);
    expect(charged + paid).toBe(10_000n); // exactly one $100 of spending
  });

  it("nets a refund against its original expense", () => {
    const spent = spendingDelta("EXPENSE", 12_900n);
    const refunded = spendingDelta("REFUND", 12_900n);
    expect(spent + refunded).toBe(0n);
  });
});

describe("pair classification", () => {
  const checking = { id: "a", type: "CHECKING" as const };
  const savings = { id: "b", type: "SAVINGS" as const };
  const card = { id: "c", type: "CREDIT_CARD" as const };
  const loan = { id: "d", type: "LOAN" as const };

  it("treats asset → asset as a plain transfer", () => {
    const r = classifyPair(checking, savings);
    expect(r.kind).toBe("TRANSFER");
    expect(r.outType).toBe("TRANSFER_OUT");
    expect(r.inType).toBe("TRANSFER_IN");
  });

  it("recognises a card payment without the user saying so", () => {
    const r = classifyPair(checking, card);
    expect(r.kind).toBe("CREDIT_CARD_PAYMENT");
    expect(r.outType).toBe("CREDIT_CARD_PAYMENT");
  });

  it("recognises a loan payment", () => {
    expect(classifyPair(checking, loan).kind).toBe("DEBT_PAYMENT");
  });

  it("treats a cash advance from a card as a transfer", () => {
    expect(classifyPair(card, checking).kind).toBe("TRANSFER");
  });

  it("honours an explicit goal-contribution hint", () => {
    const r = classifyPair(checking, savings, "GOAL_CONTRIBUTION");
    expect(r.outType).toBe("GOAL_CONTRIBUTION");
  });
});

describe("net worth and the sign convention", () => {
  it("treats every balance as already signed, with no per-type flip", () => {
    // The convention: money in is positive, money out is negative, for every
    // account type. A card you owe $2,860 on has a balance of -286000. There is
    // no negation here, which is what stops net worth being wrong by double the
    // card balance when a liability gets negated twice — or not at all.
    expect(netWorthDelta({ id: "1", type: "CHECKING" }, 100_000n)).toBe(100_000n);
    expect(netWorthDelta({ id: "2", type: "CREDIT_CARD" }, -286_040n)).toBe(-286_040n);
    expect(netWorthDelta({ id: "3", type: "LOAN" }, -1_224_000n)).toBe(-1_224_000n);
  });

  it("sums to the right net worth across assets and liabilities", () => {
    const accounts: Array<[AccountShape, bigint]> = [
      [{ id: "a", type: "CHECKING" }, 824_012n],
      [{ id: "b", type: "SAVINGS" }, 260_043n],
      [{ id: "c", type: "CREDIT_CARD" }, -286_040n],
      [{ id: "d", type: "LOAN" }, -1_224_000n],
    ];
    const net = accounts.reduce((acc, [account, balance]) => acc + netWorthDelta(account, balance), 0n);
    expect(net).toBe(824_012n + 260_043n - 286_040n - 1_224_000n);
  });

  it("reports the positive amount owed for display", () => {
    // A statement says "Balance: $2,860.40", not "-$2,860.40".
    expect(owedAmount({ id: "2", type: "CREDIT_CARD" }, -286_040n)).toBe(286_040n);
    // A card in credit owes nothing.
    expect(owedAmount({ id: "2", type: "CREDIT_CARD" }, 5_000n)).toBe(0n);
    // An asset passes through unchanged.
    expect(owedAmount({ id: "1", type: "CHECKING" }, 824_012n)).toBe(824_012n);
  });

  it("knows which types are liabilities", () => {
    expect(isLiabilityAccount({ id: "3", type: "LOAN" })).toBe(true);
    expect(isLiabilityAccount({ id: "3", type: "CREDIT_CARD" })).toBe(true);
    expect(isLiabilityAccount({ id: "3", type: "LIABILITY" })).toBe(true);
    expect(isLiabilityAccount({ id: "4", type: "SAVINGS" })).toBe(false);
    expect(isLiabilityAccount({ id: "4", type: "INVESTMENT" })).toBe(false);
  });
});

describe("validation", () => {
  it("rejects non-positive amounts", () => {
    expect(validate({ type: "EXPENSE", amountMinor: 0n }).map((v) => v.code))
      .toContain("AMOUNT_NOT_POSITIVE");
    expect(validate({ type: "EXPENSE", amountMinor: -1n }).map((v) => v.code))
      .toContain("AMOUNT_NOT_POSITIVE");
  });

  it("requires a transfer id on paired types", () => {
    expect(validate({ type: "TRANSFER_OUT", amountMinor: 100n }).map((v) => v.code))
      .toContain("PAIR_MISSING");
    expect(validate({ type: "TRANSFER_OUT", amountMinor: 100n, transferId: "t1" })).toEqual([]);
  });

  it("refuses a transfer id on an unpaired type", () => {
    expect(validate({ type: "EXPENSE", amountMinor: 100n, transferId: "t1", categoryId: "c" }).map((v) => v.code))
      .toContain("PAIR_UNEXPECTED");
  });

  it("requires a refund to be anchored somewhere", () => {
    expect(validate({ type: "REFUND", amountMinor: 100n }).map((v) => v.code))
      .toContain("REVERSAL_UNANCHORED");
    expect(validate({ type: "REFUND", amountMinor: 100n, categoryId: "cat" })).toEqual([]);
    expect(validate({ type: "REFUND", amountMinor: 100n, reversesTransactionId: "tx" })).toEqual([]);
  });

  it("requires splits to reconcile exactly", () => {
    const bad = validate({
      type: "EXPENSE",
      amountMinor: 27_000n,
      categoryId: "c",
      splits: [{ amountMinor: 9000n }, { amountMinor: 9000n }],
    });
    expect(bad.map((v) => v.code)).toContain("SPLIT_MISMATCH");

    const good = validate({
      type: "EXPENSE",
      amountMinor: 27_000n,
      categoryId: "c",
      splits: [{ amountMinor: 9000n }, { amountMinor: 9000n }, { amountMinor: 9000n }],
    });
    expect(good).toEqual([]);
  });

  it("rejects a single-part split", () => {
    expect(
      validate({
        type: "EXPENSE",
        amountMinor: 100n,
        categoryId: "c",
        splits: [{ amountMinor: 100n }],
      }).map((v) => v.code),
    ).toContain("SPLIT_TRIVIAL");
  });
});

describe("presentAmount", () => {
  const present = (type: TransactionType) => {
    const s = semanticsOf(type);
    return presentAmount({ direction: s.direction, isIncome: s.isIncome, isTransfer: s.isPaired });
  };

  it("signs a refund as money coming back", () => {
    // The bug this replaced: a refund is not income and not a transfer, so an
    // `isIncome ? "+" : "−"` test fell through to the minus and displayed
    // −$32.08 for $32.08 the user got back.
    expect(present("REFUND")).toEqual({ sign: "always", tone: "default" });
    expect(present("REIMBURSEMENT")).toEqual({ sign: "always", tone: "default" });
  });

  it("keeps the inflow tone for actual earnings only", () => {
    expect(present("INCOME")).toEqual({ sign: "always", tone: "inflow" });
    expect(present("INTEREST")).toEqual({ sign: "always", tone: "inflow" });
    expect(present("DIVIDEND")).toEqual({ sign: "always", tone: "inflow" });
    // A refund is money in, but it is not earnings, so it stays in plain ink.
    expect(present("REFUND").tone).toBe("default");
  });

  it("signs spending negative", () => {
    expect(present("EXPENSE")).toEqual({ sign: "explicit-minus", tone: "default" });
    expect(present("FEE")).toEqual({ sign: "explicit-minus", tone: "default" });
  });

  it("gives both legs of a paired movement no sign at all", () => {
    // Moving your own money is neither a gain nor a loss; a sign would claim
    // one. This is what stops a card payment reading as $510 of spending.
    for (const type of [
      "TRANSFER_OUT",
      "TRANSFER_IN",
      "CREDIT_CARD_PAYMENT",
      "CREDIT_CARD_RECEIPT",
    ] as const) {
      expect(present(type), type).toEqual({ sign: "never", tone: "transfer" });
    }
  });

  it("never signs an outflow as positive, for any type", () => {
    // A blanket guard: whatever the type, the sign must agree with direction.
    for (const type of Object.keys(SEMANTICS) as TransactionType[]) {
      const s = semanticsOf(type);
      const { sign } = present(type);
      if (s.isPaired) {
        expect(sign, type).toBe("never");
      } else if (s.direction > 0) {
        expect(sign, type).toBe("always");
      } else {
        expect(sign, type).toBe("explicit-minus");
      }
    }
  });
});

describe("day net, the way a transaction list computes it", () => {
  /** income − spending, as `groupByDay` does it. */
  const dayNet = (rows: Array<[TransactionType, bigint]>) =>
    rows.reduce(
      (acc, [type, minor]) => acc + incomeDelta(type, minor) - spendingDelta(type, minor),
      0n,
    );

  it("counts a refund against the day's spending", () => {
    // A $270 dinner and a $32.08 refund is a net $237.92 out. Testing
    // `isSpending`/`isIncome` alone drops the refund and reports −$270.00.
    expect(dayNet([["EXPENSE", 27000n], ["REFUND", 3208n]])).toBe(-23792n);
  });

  it("nets a payday against the same day's spending and refund", () => {
    expect(
      dayNet([
        ["INCOME", 291000n],
        ["EXPENSE", 27000n],
        ["REFUND", 3208n],
      ]),
    ).toBe(267208n);
  });

  it("leaves a card payment out of the day entirely", () => {
    // Both legs of paying a card are the user's own money moving. Neither leg
    // is spending or income, so the day net must not move at all.
    expect(
      dayNet([
        ["CREDIT_CARD_PAYMENT", 51000n],
        ["CREDIT_CARD_RECEIPT", 51000n],
      ]),
    ).toBe(0n);
  });

  it("leaves a transfer out of the day entirely", () => {
    expect(dayNet([["TRANSFER_OUT", 120000n], ["TRANSFER_IN", 120000n]])).toBe(0n);
  });

  it("does not let a refund alone read as income", () => {
    // A day with only a refund is money in, but it is a reduction in spending
    // rather than earnings — the net is positive, the income is nil.
    expect(dayNet([["REFUND", 3208n]])).toBe(3208n);
    expect(incomeDelta("REFUND", 3208n)).toBe(0n);
  });
});
