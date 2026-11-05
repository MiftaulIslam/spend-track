import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  InvalidAmountError,
  add,
  allocate,
  allocateByRatio,
  compare,
  divRoundHalfAway,
  equals,
  exponentOf,
  format,
  formatParts,
  fromDTO,
  money,
  multiply,
  negate,
  parseAmount,
  percentBps,
  subtract,
  sum,
  toDTO,
  toDecimalString,
  zero,
} from "@/src/domain/money";

describe("exponents", () => {
  it("defaults to 2 and knows the exceptions", () => {
    expect(exponentOf("USD")).toBe(2);
    expect(exponentOf("eur")).toBe(2);
    expect(exponentOf("JPY")).toBe(0);
    expect(exponentOf("KWD")).toBe(3);
    expect(exponentOf("ZZZ")).toBe(2);
  });
});

describe("parseAmount", () => {
  it("parses plain decimals", () => {
    expect(parseAmount("12.34", "USD").minor).toBe(1234n);
    expect(parseAmount("0.01", "USD").minor).toBe(1n);
    expect(parseAmount("1000", "USD").minor).toBe(100_000n);
  });

  it("handles grouping separators in both conventions", () => {
    expect(parseAmount("1,234.56", "USD").minor).toBe(123_456n);
    expect(parseAmount("1.234,56", "EUR").minor).toBe(123_456n);
    expect(parseAmount("1 234,56", "EUR").minor).toBe(123_456n);
    expect(parseAmount("1,234", "USD").minor).toBe(123_400n);
  });

  it("strips currency symbols", () => {
    expect(parseAmount("$1,234.56", "USD").minor).toBe(123_456n);
    expect(parseAmount("€12,50", "EUR").minor).toBe(1250n);
  });

  it("understands accounting and leading negatives", () => {
    expect(parseAmount("(12.34)", "USD").minor).toBe(-1234n);
    expect(parseAmount("-12.34", "USD").minor).toBe(-1234n);
  });

  it("respects zero-decimal currencies", () => {
    expect(parseAmount("620", "JPY").minor).toBe(620n);
    expect(() => parseAmount("620.5", "JPY")).toThrow(InvalidAmountError);
  });

  it("respects three-decimal currencies", () => {
    expect(parseAmount("1.234", "KWD").minor).toBe(1234n);
  });

  it("rejects extra precision rather than rounding it away", () => {
    // Silently dropping a digit here is how a financial app loses money.
    expect(() => parseAmount("12.345", "USD")).toThrow(InvalidAmountError);
  });

  it("rejects junk", () => {
    expect(() => parseAmount("", "USD")).toThrow(InvalidAmountError);
    expect(() => parseAmount("abc", "USD")).toThrow(InvalidAmountError);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts exactly", () => {
    const a = parseAmount("0.1", "USD");
    const b = parseAmount("0.2", "USD");
    expect(toDecimalString(add(a, b))).toBe("0.30"); // not 0.30000000000000004
    expect(toDecimalString(subtract(b, a))).toBe("0.10");
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(100n, "USD"), money(100n, "EUR"))).toThrow(CurrencyMismatchError);
  });

  it("sums a list", () => {
    const items = [money(100n, "USD"), money(250n, "USD"), money(-50n, "USD")];
    expect(sum(items, "USD").minor).toBe(300n);
    expect(sum([], "USD").minor).toBe(0n);
  });

  it("multiplies by a rational without float error", () => {
    // 7% of 1234.56 = 86.4192 -> 86.42
    expect(multiply(parseAmount("1234.56", "USD"), 7n, 100n).minor).toBe(8642n);
    expect(percentBps(parseAmount("100.00", "USD"), 2474).minor).toBe(2474n);
  });

  it("rounds half away from zero", () => {
    expect(divRoundHalfAway(5n, 2n)).toBe(3n);
    expect(divRoundHalfAway(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfAway(4n, 2n)).toBe(2n);
    expect(divRoundHalfAway(1n, 3n)).toBe(0n);
    expect(divRoundHalfAway(2n, 3n)).toBe(1n);
  });

  it("compares and negates", () => {
    expect(compare(money(1n, "USD"), money(2n, "USD"))).toBe(-1);
    expect(compare(money(2n, "USD"), money(2n, "USD"))).toBe(0);
    expect(negate(money(5n, "USD")).minor).toBe(-5n);
    expect(equals(money(5n, "USD"), money(5n, "USD"))).toBe(true);
    expect(equals(money(5n, "USD"), money(5n, "EUR"))).toBe(false);
  });
});

describe("allocate", () => {
  it("splits without losing a cent", () => {
    const shares = allocate(parseAmount("10.00", "USD"), 3);
    expect(shares.map((s) => s.minor)).toEqual([334n, 333n, 333n]);
    expect(sum(shares, "USD").minor).toBe(1000n);
  });

  it("handles exact divisions", () => {
    const shares = allocate(parseAmount("9.00", "USD"), 3);
    expect(shares.map((s) => s.minor)).toEqual([300n, 300n, 300n]);
  });

  it("handles negatives", () => {
    const shares = allocate(parseAmount("-10.00", "USD"), 3);
    expect(sum(shares, "USD").minor).toBe(-1000n);
    expect(shares.map((s) => s.minor)).toEqual([-334n, -333n, -333n]);
  });

  it("reconciles for every part count from 1 to 40", () => {
    const total = parseAmount("1234.57", "USD");
    for (let n = 1; n <= 40; n++) {
      expect(sum(allocate(total, n), "USD").minor).toBe(total.minor);
    }
  });

  it("rejects a non-positive part count", () => {
    expect(() => allocate(money(100n, "USD"), 0)).toThrow(InvalidAmountError);
  });
});

describe("allocateByRatio", () => {
  it("splits by weights and reconciles exactly", () => {
    const shares = allocateByRatio(parseAmount("100.00", "USD"), [50, 30, 20]);
    expect(shares.map((s) => s.minor)).toEqual([5000n, 3000n, 2000n]);
    expect(sum(shares, "USD").minor).toBe(10_000n);
  });

  it("absorbs rounding in the last share", () => {
    const shares = allocateByRatio(parseAmount("10.00", "USD"), [1, 1, 1]);
    expect(sum(shares, "USD").minor).toBe(1000n);
  });

  it("rejects zero weights", () => {
    expect(() => allocateByRatio(money(100n, "USD"), [0, 0])).toThrow(InvalidAmountError);
  });
});

describe("presentation", () => {
  it("renders decimal strings for every exponent", () => {
    expect(toDecimalString(money(1234n, "USD"))).toBe("12.34");
    expect(toDecimalString(money(-5n, "USD"))).toBe("-0.05");
    expect(toDecimalString(money(620n, "JPY"))).toBe("620");
    expect(toDecimalString(money(1234n, "KWD"))).toBe("1.234");
    expect(toDecimalString(zero("USD"))).toBe("0.00");
  });

  it("formats with locale and currency", () => {
    expect(format(money(123_456n, "USD"))).toBe("$1,234.56");
    expect(format(money(123_456n, "USD"), { display: "none" })).toBe("1,234.56");
  });

  it("does not throw on an unknown currency", () => {
    expect(format(money(100n, "ZZZ"))).toContain("1.00");
  });

  it("splits into parts for typographic styling", () => {
    const parts = formatParts(money(123_456n, "USD"));
    expect(parts.whole).toBe("1,234");
    expect(parts.fraction).toBe("56");
    expect(parts.symbol).toBe("$");
  });
});

describe("serialisation", () => {
  it("round-trips through a DTO", () => {
    const m = parseAmount("1234.56", "USD");
    const dto = toDTO(m);
    expect(dto).toEqual({ minor: "123456", currency: "USD", decimal: "1234.56" });
    expect(equals(fromDTO(dto), m)).toBe(true);
  });

  it("survives JSON, which bigint alone does not", () => {
    const m = parseAmount("999999999999.99", "USD");
    const revived = fromDTO(JSON.parse(JSON.stringify(toDTO(m))));
    expect(revived.minor).toBe(m.minor);
  });
});
