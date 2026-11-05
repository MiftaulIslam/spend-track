import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { EmptyState, LinkButton } from "@/src/components/ui";
import { IconSparkle } from "@/src/components/icons";
import { aiConfigured } from "@/src/server/ai/client";
import { eq } from "drizzle-orm";
import { db } from "@/src/server/db";
import { userSettings } from "@/src/server/db/schema";
import * as runner from "@/src/server/ai/runner";
import { Conversation } from "./client";

export const metadata = { title: "Assistant" };

/**
 * The assistant.
 *
 * Tool calls are rendered inline, visibly, with the arguments they were called
 * with. That is deliberate: a user should be able to audit exactly which of
 * their data the model was given, and re-run the same query themselves. And
 * every proposed change appears as a confirmation card — the model proposes,
 * the person commits.
 */
export default async function AssistantPage(props: PageProps<"/assistant">) {
  const actor = await requireUserPage("/assistant");
  const params = await props.searchParams;
  const initialQuestion = typeof params.q === "string" ? params.q : undefined;
  const conversationId = typeof params.c === "string" ? params.c : undefined;

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, actor.userId),
    columns: { aiEnabled: true },
  });

  if (!aiConfigured()) {
    return (
      <>
        <AppBar title="Assistant" sub="Not configured" />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[760px] px-4 lg:px-8">
            <div className="mt-6 overflow-clip rounded-lg border border-rule bg-surface">
              <EmptyState
                icon={<IconSparkle />}
                title="The assistant isn't set up on this instance"
                body="Set ANTHROPIC_API_KEY in the environment to enable it. Everything else in SpendTrack works without it — the ledger, budgets and reports never depend on the model."
                action={
                  <LinkButton href="/analytics" size="sm">
                    Open analytics instead
                  </LinkButton>
                }
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (settings && !settings.aiEnabled) {
    return (
      <>
        <AppBar title="Assistant" sub="Turned off" />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[760px] px-4 lg:px-8">
            <div className="mt-6 overflow-clip rounded-lg border border-rule bg-surface">
              <EmptyState
                icon={<IconSparkle />}
                title="The assistant is off"
                body="You've turned off AI features in your settings. Nothing about your financial data is sent anywhere while it's off."
                action={
                  <LinkButton href="/settings" variant="primary" size="sm">
                    Open settings
                  </LinkButton>
                }
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  const [conversations, existing] = await Promise.all([
    runner.listConversations(actor, 12),
    conversationId ? runner.getConversation(actor, conversationId).catch(() => null) : null,
  ]);

  return (
    <>
      <AppBar title="Assistant" sub="Claude, grounded on your own data" />
      <Conversation
        initialQuestion={initialQuestion}
        conversationId={existing?.id ?? null}
        history={
          existing
            ? existing.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content as unknown,
                toolCalls: m.toolCalls.map((t) => ({
                  id: t.id,
                  toolName: t.toolName,
                  input: t.input as Record<string, unknown>,
                  output: t.output as unknown,
                  mutating: t.mutating,
                  status: t.status,
                  durationMs: t.durationMs,
                })),
              }))
            : []
        }
        conversations={conversations}
        canMutate={actor.householdRole !== "VIEWER"}
      />
    </>
  );
}
