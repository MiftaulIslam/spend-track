/**
 * Environment invariants that are cheap to check and expensive to get wrong.
 *
 * The OAuth origin is the motivating case. `AUTH_URL` is what Auth.js signs
 * into the `redirect_uri` it hands Google; the dev server's bound port is a
 * separate fact, set by `next dev -p`. Nothing ties them together, so they can
 * drift — and when they do, the failure lands *after* the user has already
 * typed their password into Google: the browser bounces back to an origin
 * where nothing is listening and shows ERR_CONNECTION_REFUSED, which reads
 * like a Google outage rather than a one-character config mismatch.
 *
 * Note `PORT` cannot be set in `.env` — Next boots the HTTP server before any
 * env file is read — so the port genuinely lives in the dev script, and this
 * check is the only thing that can notice the two disagreeing.
 */

import * as z from "zod";

const httpUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "Must be an absolute http(s) URL.",
  });

export const serverEnvSchema = z.object({
  AUTH_URL: httpUrl,
  APP_URL: httpUrl,
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Called once at server start, with the port the HTTP server actually bound.
 *
 * TODO(you): decide what this does when the environment is wrong.
 *
 * The three axes worth settling, because they trade against each other:
 *
 *   1. Throw, or warn and continue? Throwing makes the mismatch impossible to
 *      ignore, but it also means a missing var takes down CI and prod boots,
 *      not just local dev.
 *   2. Does the rule differ by NODE_ENV? A prod deploy behind a load balancer
 *      binds some arbitrary internal port that will never match AUTH_URL's,
 *      so a strict port check is a dev-only truth.
 *   3. Compare only the port, or the whole origin? AUTH_URL vs APP_URL can
 *      drift from each other too, and that breaks post-sign-in redirects.
 */
export function assertEnv(boundPort: number): void {
  // TODO(you): implement.
}
