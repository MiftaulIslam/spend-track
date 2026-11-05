import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { PageTitle } from "@/src/components/ui";
import * as accountService from "@/src/server/services/account-service";
import { NewAccountForm } from "./new-account-form";

export const metadata = { title: "New account" };

/**
 * Add an account.
 *
 * The first account is the only thing standing between a new user and a ledger
 * that does anything, so this page is reachable from the accounts empty state,
 * the dashboard and directly by URL.
 */
export default async function NewAccountPage() {
  const actor = await requireUserPage("/accounts/new");
  const existing = await accountService.list(actor);
  const isFirst = existing.length === 0;

  return (
    <>
      <AppBar title="New account" back="/accounts" />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[720px] px-4 py-6 lg:px-8">
          <PageTitle
            sub={
              isFirst
                ? "Start with the account you use most. You can add the rest later."
                : "Balances are entered by you — nothing connects to a bank."
            }
          >
            {isFirst ? "Add your first account" : "Add an account"}
          </PageTitle>
          <div className="mt-6">
            <NewAccountForm baseCurrency={actor.baseCurrency} isFirst={isFirst} />
          </div>
        </div>
      </main>
    </>
  );
}
