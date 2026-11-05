import { describe, expect, it } from "vitest";
import { AppError, databaseErrorCode, toAppError } from "@/src/server/errors";

/**
 * Database errors reach us wrapped.
 *
 * The driver throws a plain Postgres error, Drizzle wraps it in its own error
 * and hangs the original off `cause`. Reading `error.code` from the outer
 * object finds nothing — which turned every duplicate-key into an unhandled
 * failure, including the one the notification dedupe relies on to know a
 * message has already been sent.
 */

class Wrapped extends Error {
  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = "DrizzleQueryError";
  }
}

describe("databaseErrorCode", () => {
  it("reads a code off a bare driver error", () => {
    expect(databaseErrorCode(Object.assign(new Error("dup"), { code: "23505" }))).toBe("23505");
  });

  it("digs the code out of a wrapped error", () => {
    const pg = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(databaseErrorCode(new Wrapped("Failed query", { cause: pg }))).toBe("23505");
  });

  it("digs through more than one layer", () => {
    const pg = Object.assign(new Error("duplicate key"), { code: "23505" });
    const inner = new Wrapped("Failed query", { cause: pg });
    expect(databaseErrorCode(new Wrapped("outer", { cause: inner }))).toBe("23505");
  });

  it("gives up rather than looping on a cycle", () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(databaseErrorCode(a)).toBeNull();
  });

  it("returns null when there is no code anywhere", () => {
    expect(databaseErrorCode(new Error("plain"))).toBeNull();
    expect(databaseErrorCode(null)).toBeNull();
    expect(databaseErrorCode("a string")).toBeNull();
  });
});

describe("toAppError, for database failures", () => {
  const wrap = (code: string) =>
    new Wrapped("Failed query", {
      cause: Object.assign(new Error("db said no"), { code }),
    });

  it("turns a wrapped unique violation into something a person can read", () => {
    const result = toAppError(wrap("23505"));
    expect(result.status).toBe(409);
    expect(result.userMessage).toBe("Something with those details already exists.");
  });

  it("maps the other codes worth naming", () => {
    expect(toAppError(wrap("23503")).userMessage).toContain("no longer exists");
    expect(toAppError(wrap("23502")).userMessage).toContain("required");
    expect(toAppError(wrap("40001")).userMessage).toContain("Try again");
    expect(toAppError(wrap("22P02")).userMessage).toContain("not valid");
  });

  it("never leaks the raw query in the user-facing message", () => {
    // The whole point: the message the user sees must not be the SQL.
    const result = toAppError(wrap("23505"));
    expect(result.userMessage).not.toContain("insert into");
    expect(result.userMessage).not.toContain("db said no");
  });

  it("falls back to an incident id for anything unrecognised", () => {
    const result = toAppError(wrap("XX999"));
    expect(result.status).toBe(500);
    expect(result.incidentId).toMatch(/^inc_/);
  });

  it("passes an AppError straight through", () => {
    const original = new AppError("FORBIDDEN", 403, "Not yours.");
    expect(toAppError(original)).toBe(original);
  });
});
