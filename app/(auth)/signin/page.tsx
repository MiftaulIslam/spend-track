import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/src/server/auth/guards";
import { SignInForm } from "./sign-in-form";
import { Callout } from "@/src/components/ui";
import { IconInfo } from "@/src/components/icons";

export const metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/signin">) {
  const actor = await getActor();
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  if (actor) redirect(next);

  const error = typeof params.error === "string" ? params.error : null;
  const showQaAccounts = process.env.NODE_ENV !== "production";

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-8">
      <div className="w-full max-w-[392px]">
        <Link href="/welcome" className="mb-6 flex items-center gap-2.5">
          <span className="grid size-[26px] place-items-center rounded-[7px] bg-ink font-mono text-[13px] font-semibold text-brass-bright">
            S
          </span>
          <span className="font-serif text-[19px] tracking-[-0.015em]">SpendTrack</span>
        </Link>

        <h1 className="font-serif text-[2.4rem] leading-[1.05] font-normal tracking-[-0.03em]">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">Sign in to your ledger.</p>

        {error ? (
          <Callout tone="danger" icon={<IconInfo />} className="mt-5">
            {error === "CredentialsSignin"
              ? "That email and password don't match. Check them and try again."
              : "We couldn't sign you in. Try again in a moment."}
          </Callout>
        ) : null}

        <SignInForm next={next} googleConfigured={Boolean(process.env.AUTH_GOOGLE_ID)} />

        {showQaAccounts ? (
          <Callout tone="info" icon={<IconInfo />} className="mt-6">
            <b>QA accounts</b> (development only)
            <div className="num mt-2 space-y-0.5 text-2xs leading-relaxed">
              <div>qa.owner@spendtrack.test — full ledger, 2 years of history</div>
              <div>qa.new@spendtrack.test — brand-new account, empty states</div>
              <div>qa.member@spendtrack.test — household member</div>
              <div>qa.admin@spendtrack.test — platform super admin</div>
              <div className="pt-1 opacity-70">password: password123</div>
            </div>
          </Callout>
        ) : null}

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-tertiary">
          By continuing you agree to the{" "}
          <a href="#" className="underline underline-offset-2">
            Terms
          </a>{" "}
          and{" "}
          <a href="#" className="underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
