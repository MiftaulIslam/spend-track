/**
 * Error taxonomy.
 *
 * Every error that can reach a user carries a stable `code`, an HTTP status,
 * and a message that is **safe to render as-is**. Anything else becomes an
 * InternalError with an incident id — the detail goes to the log, the reference
 * goes to the person, and no stack trace or SQL fragment ever reaches a screen.
 */

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PRECONDITION_FAILED"
  | "INTERNAL";

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to show. Written for a person, not a developer. */
  readonly userMessage: string;
  readonly issues?: FieldIssue[];
  readonly incidentId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    status: number,
    userMessage: string,
    options: {
      cause?: unknown;
      issues?: FieldIssue[];
      incidentId?: string;
      retryAfterSeconds?: number;
      logMessage?: string;
    } = {},
  ) {
    super(options.logMessage ?? userMessage, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.issues = options.issues;
    this.incidentId = options.incidentId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.userMessage,
        ...(this.issues ? { issues: this.issues } : {}),
        ...(this.incidentId ? { incidentId: this.incidentId } : {}),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(userMessage = "Some of those details need another look.", issues?: FieldIssue[]) {
    super("VALIDATION_FAILED", 400, userMessage, { issues });
    this.name = "ValidationError";
  }
}

/**
 * Deliberately the same message and status whether the row does not exist or
 * belongs to someone else. Distinguishing them tells an attacker which ids are
 * real.
 */
export class NotFoundError extends AppError {
  constructor(entity = "That") {
    super("NOT_FOUND", 404, `${entity} could not be found.`, {
      logMessage: `${entity} not found or not owned by the actor`,
    });
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = "You don't have access to this.") {
    super("FORBIDDEN", 403, userMessage);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(userMessage = "Please sign in to continue.") {
    super("UNAUTHORIZED", 401, userMessage);
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends AppError {
  constructor(userMessage = "That change conflicts with the current state.") {
    super("CONFLICT", 409, userMessage);
    this.name = "ConflictError";
  }
}

export class DuplicateError extends AppError {
  constructor(userMessage = "That already exists.") {
    super("DUPLICATE", 409, userMessage);
    this.name = "DuplicateError";
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number, userMessage = "You're going a bit fast. Try again shortly.") {
    super("RATE_LIMITED", 429, userMessage, { retryAfterSeconds });
    this.name = "RateLimitError";
  }
}

export class UpstreamError extends AppError {
  constructor(service: string, cause?: unknown) {
    super("UPSTREAM_UNAVAILABLE", 503, `${service} didn't respond. Everything else still works.`, {
      cause,
      logMessage: `upstream ${service} unavailable`,
    });
    this.name = "UpstreamError";
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(limitMb: number) {
    super("PAYLOAD_TOO_LARGE", 413, `That file is too large. The limit is ${limitMb} MB.`);
    this.name = "PayloadTooLargeError";
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(accepted: string) {
    super("UNSUPPORTED_MEDIA_TYPE", 415, `That file type isn't supported. Accepted: ${accepted}.`);
    this.name = "UnsupportedMediaTypeError";
  }
}

export class PreconditionError extends AppError {
  constructor(userMessage: string) {
    super("PRECONDITION_FAILED", 412, userMessage);
    this.name = "PreconditionError";
  }
}

export class InternalError extends AppError {
  constructor(incidentId: string, cause?: unknown) {
    super("INTERNAL", 500, "Something went wrong on our side. Nothing was saved.", {
      cause,
      incidentId,
      logMessage: `internal error ${incidentId}`,
    });
    this.name = "InternalError";
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export function newIncidentId(): string {
  return `inc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Postgres error codes we can translate into something a person understands.
 *
 * These are SQLSTATE codes, which the driver surfaces directly. They used to be
 * Prisma's own P-codes; with no ORM in between, the database speaks for itself.
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const DATABASE_MESSAGES: Record<string, () => AppError> = {
  // unique_violation
  "23505": () => new DuplicateError("Something with those details already exists."),
  // foreign_key_violation
  "23503": () => new ConflictError("That references something that no longer exists."),
  // not_null_violation
  "23502": () => new ValidationError("Something required was missing."),
  // check_violation
  "23514": () => new ValidationError("That value is not allowed here."),
  // serialization_failure / deadlock_detected — both mean "retry"
  "40001": () => new ConflictError("Another change landed first. Try again."),
  "40P01": () => new ConflictError("Another change landed first. Try again."),
  // invalid_text_representation, usually a malformed id reaching a query
  "22P02": () => new ValidationError("That identifier is not valid."),
};

/**
 * Dig the SQLSTATE code out of whatever the driver threw.
 *
 * Drizzle wraps a failed query in its own error and hangs the real one off
 * `cause`, sometimes more than one level deep. Reading `error.code` from the
 * top-level object finds nothing, which silently turned every duplicate-key
 * into an unhandled 500 — including the one the notification dedupe depends on
 * to do its job.
 */
export function databaseErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && "code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string" && code.length > 0) return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Convert anything thrown anywhere into an AppError.
 * The only place a raw exception is allowed to be inspected.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const code = databaseErrorCode(error);
  if (code) {
    const build = DATABASE_MESSAGES[code];
    if (build) return build();
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT") {
      return new UpstreamError("The database");
    }
  }

  // Zod v4 errors surface as ZodError with an `issues` array.
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
    const issues = (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues;
    return new ValidationError(
      "Some of those details need another look.",
      issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }

  const incidentId = newIncidentId();
  console.error(`[${incidentId}]`, error);
  return new InternalError(incidentId, error);
}

/** Uniform JSON body + headers for a Route Handler. */
export function errorResponse(error: unknown): Response {
  const appError = toAppError(error);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (appError.retryAfterSeconds) headers["retry-after"] = String(appError.retryAfterSeconds);
  return new Response(JSON.stringify(appError.toJSON()), { status: appError.status, headers });
}

/** Shape returned by Server Actions, so forms can render errors without throwing. */
export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: ErrorCode; message: string; issues?: FieldIssue[]; incidentId?: string };
}

export const actionOk = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export function actionError(error: unknown): ActionResult<never> {
  const appError = toAppError(error);
  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.userMessage,
      issues: appError.issues,
      incidentId: appError.incidentId,
    },
  };
}
