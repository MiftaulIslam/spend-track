import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Badge, Dot, EmptyState, Panel, PanelBody } from "@/src/components/ui";
import { IconStore } from "@/src/components/icons";
import * as merchantService from "@/src/server/services/merchant-service";

export const metadata = { title: "Merchants" };

/**
 * Merchants.
 *
 * Bank descriptors are noise — "SQ *COFFEE 0093 NEW YORK" is one coffee shop
 * seen three ways. The merchant service normalises them; this page shows the
 * result, so the alias count is the interesting column: a merchant with six
 * aliases is six descriptors that would otherwise look like six payees.
 */
export default async function MerchantsPage(props: PageProps<"/merchants">) {
  const actor = await requireUserPage("/merchants");
  const params = await props.searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;

  const merchants = await merchantService.list(actor, { search, limit: 200 });

  return (
    <>
      <AppBar title="Merchants" sub={`${merchants.length} known`} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {merchants.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconStore />}
                title="No merchants yet"
                body="Merchants are recognised from your transactions as you add them. Import a statement or add a few transactions and they will appear here."
              />
            </Panel>
          ) : (
            <Panel>
              <PanelBody className="px-0 pb-0">
                {merchants.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm">{m.name}</span>
                      {m.defaultCategory ? (
                        <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-tertiary">
                          <Dot index={m.defaultCategory.colorIndex} />
                          {m.defaultCategory.name}
                        </span>
                      ) : null}
                    </div>
                    {m.aliasCount > 1 ? <Badge tone="neutral">{m.aliasCount} aliases</Badge> : null}
                    <span className="num w-12 shrink-0 text-right text-xs text-ink-tertiary">
                      {m.transactionCount}
                    </span>
                  </div>
                ))}
              </PanelBody>
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}
