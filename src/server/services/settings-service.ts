import { eq } from "drizzle-orm";
import * as z from "zod";
import { db as rootDb, type Db } from "@/src/server/db";
import { userSettings } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { currencyCode } from "@/src/lib/schemas";
import * as audit from "./audit-service";

/**
 * User settings.
 *
 * Everything here changes how numbers are *displayed*, never what they are —
 * amounts are stored in integer minor units against the account's own currency,
 * so changing the base currency re-presents the ledger rather than rewriting it.
 * That is why the base currency is editable at all.
 */

export const updateSettingsSchema = z.object({
  baseCurrency: currencyCode.optional(),
  locale: z.string().trim().min(2).max(32).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  monthStartsOn: z.number().int().min(1).max(28).optional(),
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  hideBalances: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  aiAutoCategorise: z.boolean().optional(),
  aiAutoApplyMutations: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export interface SettingsDTO {
  baseCurrency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
  monthStartsOn: number;
  numberFormat: string;
  theme: string;
  hideBalances: boolean;
  reduceMotion: boolean;
  aiEnabled: boolean;
  aiAutoCategorise: boolean;
  aiAutoApplyMutations: boolean;
  onboardingCompletedAt: string | null;
}

/** Defaults match the column defaults, so a missing row is not a broken page. */
const FALLBACK: SettingsDTO = {
  baseCurrency: "USD",
  locale: "en-US",
  timezone: "UTC",
  weekStartsOn: 1,
  monthStartsOn: 1,
  numberFormat: "1,234.56",
  theme: "SYSTEM",
  hideBalances: false,
  reduceMotion: false,
  aiEnabled: true,
  aiAutoCategorise: true,
  aiAutoApplyMutations: false,
  onboardingCompletedAt: null,
};

export async function get(actor: ActorContext, db: Db = rootDb): Promise<SettingsDTO> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, actor.userId),
  });
  if (!row) return FALLBACK;
  return {
    baseCurrency: row.baseCurrency,
    locale: row.locale,
    timezone: row.timezone,
    weekStartsOn: row.weekStartsOn,
    monthStartsOn: row.monthStartsOn,
    numberFormat: row.numberFormat,
    theme: row.theme,
    hideBalances: row.hideBalances,
    reduceMotion: row.reduceMotion,
    aiEnabled: row.aiEnabled,
    aiAutoCategorise: row.aiAutoCategorise,
    aiAutoApplyMutations: row.aiAutoApplyMutations,
    onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
  };
}

export async function update(
  actor: ActorContext,
  input: UpdateSettingsInput,
  db: Db = rootDb,
): Promise<SettingsDTO> {
  const parsed = updateSettingsSchema.parse(input);
  const before = await get(actor, db);

  await db
    .update(userSettings)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(userSettings.userId, actor.userId));

  const after = await get(actor, db);

  // Settings changes are auditable for the same reason ledger changes are:
  // "why is everything suddenly in taka" needs an answer.
  await audit.record(
    actor,
    {
      action: "settings.update",
      entityType: "UserSettings",
      entityId: actor.userId,
      before,
      after,
    },
    db,
  );

  return after;
}
