import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * IP addresses are personal data. We need them for rate limiting and for
 * "signed in from a new device" — both of which work on an opaque identifier,
 * so the raw address is never stored.
 */
const SALT = process.env.AUTH_SECRET ?? "spendtrack-dev-salt";

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time comparison for anything secret (invite tokens, job secrets). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do the comparison so the timing does not leak the length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Deterministic 0-99 bucket for feature-flag rollouts. The same user always
 * lands in the same bucket for a given flag, so a 5% rollout is a stable 5%
 * rather than a coin flip on every request.
 */
export function rolloutBucket(userId: string, flagKey: string): number {
  const digest = createHash("sha256").update(`${flagKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}
