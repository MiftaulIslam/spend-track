"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, EmptyState } from "@/src/components/ui";
import { IconAlert } from "@/src/components/icons";

/**
 * Route error boundary.
 *
 * Never shows the raw message — `error.message` from a Server Component can
 * contain a query, a path or an id. The digest is a server-side reference the
 * user can quote, and the log has the detail.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="grid flex-1 place-items-center px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-rule bg-surface">
        <EmptyState
          icon={<IconAlert />}
          title="Something went wrong on this page"
          body="Your data is safe — this is a display problem, not a data problem. Try again, or head back to the overview."
          action={
            <>
              <Button variant="primary" size="sm" onClick={reset}>
                Try again
              </Button>
              <Link
                href="/"
                className="inline-flex h-8 items-center rounded-md border border-rule-strong bg-surface px-3 text-sm font-medium"
              >
                Go to overview
              </Link>
            </>
          }
        />
        {error.digest ? (
          <p className="num border-t border-rule px-4 py-2.5 text-center text-2xs text-ink-tertiary">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
