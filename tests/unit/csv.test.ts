import { describe, expect, it } from "vitest";
import { guessRoles, parseCsv, parseCsvAmount, parseCsvDate } from "@/src/lib/csv";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("Date,Description,Amount\n01/09/2026,Chaldal,-1250.00");
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toEqual([["01/09/2026", "Chaldal", "-1250.00"]]);
  });

  it("keeps commas that live inside quoted fields", () => {
    const { rows } = parseCsv('Date,Description\n01/09/2026,"Chaldal, Dhanmondi branch"');
    expect(rows[0]).toEqual(["01/09/2026", "Chaldal, Dhanmondi branch"]);
  });

  it("unescapes doubled quotes", () => {
    const { rows } = parseCsv('Description\n"He said ""thanks"""');
    expect(rows[0]).toEqual(['He said "thanks"']);
  });

  it("strips the Excel BOM and handles CRLF", () => {
    const { headers, rows } = parseCsv("﻿Date,Amount\r\n01/09/2026,100\r\n");
    expect(headers).toEqual(["Date", "Amount"]);
    expect(rows).toHaveLength(1);
  });

  it("drops blank lines rather than emitting empty rows", () => {
    const { rows } = parseCsv("Date,Amount\n01/09/2026,100\n\n\n02/09/2026,200\n");
    expect(rows).toHaveLength(2);
  });
});

describe("parseCsvAmount", () => {
  it("strips separators and currency symbols", () => {
    expect(parseCsvAmount("৳1,250.00")).toEqual({ value: "1250.00", negative: false });
    expect(parseCsvAmount("$1,234.56")).toEqual({ value: "1234.56", negative: false });
  });

  it("treats a leading minus and accounting parentheses as negative", () => {
    expect(parseCsvAmount("-500")).toEqual({ value: "500", negative: true });
    expect(parseCsvAmount("(500.25)")).toEqual({ value: "500.25", negative: true });
  });

  it("returns null for blanks and non-numeric cells", () => {
    expect(parseCsvAmount("")).toBeNull();
    expect(parseCsvAmount("   ")).toBeNull();
    expect(parseCsvAmount("N/A")).toBeNull();
  });
});

describe("parseCsvDate", () => {
  it("reads a four-digit leading group as ISO", () => {
    expect(parseCsvDate("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("assumes day-first otherwise, which is what BD/UK/EU statements use", () => {
    expect(parseCsvDate("01/09/2026")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parseCsvDate("28.02.2026")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("returns null when there is no date to read", () => {
    expect(parseCsvDate("")).toBeNull();
    expect(parseCsvDate("not a date")).toBeNull();
  });
});

describe("guessRoles", () => {
  it("maps the headers a bank actually emits", () => {
    expect(guessRoles(["Date", "Particulars", "Withdrawal", "Deposit", "Balance"])).toEqual([
      "date",
      "description",
      "debit",
      "credit",
      "ignore",
    ]);
  });

  it("prefers debit/credit over amount when both could match", () => {
    const roles = guessRoles(["Transaction Date", "Narration", "Debit", "Credit"]);
    expect(roles).toContain("debit");
    expect(roles).toContain("credit");
    expect(roles).not.toContain("amount");
  });

  it("never assigns the same role twice", () => {
    const roles = guessRoles(["Date", "Date", "Amount", "Amount"]);
    expect(roles.filter((r) => r === "date")).toHaveLength(1);
    expect(roles.filter((r) => r === "amount")).toHaveLength(1);
  });
});
