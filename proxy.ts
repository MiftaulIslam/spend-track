import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (formerly middleware).
 *
 * Runs before render, so an unauthenticated navigation into the product is a
 * redirect rather than a flash of the shell followed by one. This is a *coarse*
 * gate: it checks only that a session cookie exists. Every page and handler
 * still resolves and validates the real session — a cookie is not an identity.
 */

const PUBLIC_PATHS = ["/signin", "/welcome", "/api/auth", "/api/jobs", "/api/health"];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!hasSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(NextResponse.next());
}

/**
 * Security headers.
 *
 * Set here rather than in next.config.ts so the nonce-free CSP can differ
 * between the app and the public surface if that becomes necessary.
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set(
    "permissions-policy",
    "camera=(self), microphone=(), geolocation=(self), payment=()",
  );
  response.headers.set("cross-origin-opener-policy", "same-origin");
  return response;
}

export const config = {
  // Skip static assets and image optimisation, or auth logic blocks CSS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
