import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Panel, PanelBody, PanelHead } from "@/src/components/ui";
import { SettingsForm } from "./settings-form";
import * as settingsService from "@/src/server/services/settings-service";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireUserPage("/settings");
  const settings = await settingsService.get(actor);

  return (
    <>
      <AppBar title="Settings" sub={actor.email} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[720px] px-4 py-6 lg:px-8">
          <div className="mb-6">
            <Panel>
              <PanelHead title="Account" />
              <PanelBody className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-ink-secondary">Name</span>
                  <span>{actor.name ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-secondary">Email</span>
                  <span className="truncate">{actor.email}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-secondary">Household</span>
                  <span>
                    {actor.householdRole ? actor.householdRole.toLowerCase() : "Just you"}
                  </span>
                </div>
              </PanelBody>
            </Panel>
          </div>

          <SettingsForm initial={settings} />
        </div>
      </main>
    </>
  );
}
