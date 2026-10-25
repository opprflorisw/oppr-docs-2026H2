// CONTRACT (owned by the settings lane): company-wide defaults that used to
// be hardcoded. Read on the server with readOrgSettings(ctx); read on the
// client with api.orgSettings.get. Missing values fall back to ORG_DEFAULTS.
import { query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { requireUserId } from "./lib/auth"

export const ORG_DEFAULTS = {
  documents: {
    reviewIntervalMonths: 12,
    dueSoonDays: 30,
    requireChangeNote: true,
    fourEyes: true,
  },
  training: {
    passMark: 80,
    dueDays: 14,
    refreshMonths: 12 as number | null,
    questionsPerObjective: 1,
    tryOutForSafety: true,
    failsBeforeWalkthrough: 2,
  },
  floor: {
    checkInIdleMinutes: 15,
    captureRetentionDays: null as number | null,
    captureNotice: null as string | null,
  },
}

export type OrgSettings = typeof ORG_DEFAULTS

export async function readOrgSettings(_ctx: QueryCtx | MutationCtx): Promise<OrgSettings> {
  return ORG_DEFAULTS
}

export const get = query({
  args: {},
  handler: async (ctx): Promise<OrgSettings> => {
    await requireUserId(ctx)
    return await readOrgSettings(ctx)
  },
})
