import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Callout } from "@/src/components/ui";
import { IconInfo } from "@/src/components/icons";
import { ImportClient } from "./import-client";
import * as accountService from "@/src/server/services/account-service";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const actor = await requireUserPage("/import");
  const accounts = await accountService.list(actor);

  return (
    <>
      <AppBar title="Import" back="/accounts" />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          <Callout tone="info" icon={<IconInfo />} className="mb-6">
            Imported rows become ordinary transactions — the same balance updates, rules and audit
            trail as anything you type in by hand.
          </Callout>

          <ImportClient
            accounts={accounts
              .filter((a) => !a.archivedAt)
              .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          />
        </div>
      </main>
    </>
  );
}
