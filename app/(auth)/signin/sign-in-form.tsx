"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { signInWithPassword } from "@/src/server/auth/credentials";
import { Button, Field, Input } from "@/src/components/ui";
import { IconGoogle } from "@/src/components/icons";

/**
 * Sign-in form.
 *
 * Google first because it is the path most people take and it has no failure
 * modes to design for. Credentials exist because QA and self-hosting need a way
 * in that does not require an OAuth client — and because a product that can
 * only be entered through one provider is fragile.
 */
export function SignInForm({
  next,
  googleConfigured,
}: {
  next: string;
  googleConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Goes through our own action rather than Auth.js's Credentials provider,
      // which cannot create a revocable database session. See
      // src/server/auth/credentials.ts.
      const result = await signInWithPassword(email, password);
      if (!result.ok) {
        setError(result.error ?? "That email and password don't match.");
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <>
      {googleConfigured ? (
        <>
          <Button
            variant="secondary"
            size="lg"
            block
            className="mt-6 gap-2.5"
            onClick={() => void signIn("google", { redirectTo: next })}
          >
            <IconGoogle size={17} />
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-xs text-ink-tertiary">or</span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-md border border-rule bg-sunken p-3 text-xs leading-relaxed text-ink-tertiary">
          Google sign-in isn&rsquo;t configured on this instance. Set{" "}
          <code className="num">AUTH_GOOGLE_ID</code> and{" "}
          <code className="num">AUTH_GOOGLE_SECRET</code> to enable it.
        </div>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <Field label="Email">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(error)}
          />
        </Field>
        <Field label="Password" error={error}>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" block className="mt-2" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </>
  );
}
