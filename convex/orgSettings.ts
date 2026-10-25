// CONTRACT (owned by the settings lane): company-wide defaults that used to
// be hardcoded. Read on the server with readOrgSettings(ctx); read on the
// client with api.orgSettings.get. Missing values fall back to ORG_DEFAULTS.
// Stored in the single orgSettings row (convex/settings/schema.ts); changed
// only by a checked-in Engineer or Admin through `update`.
import { ConvexError, v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"
import { ORG_LIMITS } from "./settings/limits"

export { ORG_LIMITS }

export type DocumentLanguage = "en" | "nl"

export const ORG_DEFAULTS = {
  company: {
    documentLanguages: ["en", "nl"] as DocumentLanguage[],
  },
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

export async function readOrgSettings(ctx: QueryCtx | MutationCtx): Promise<OrgSettings> {
  const row = await ctx.db.query("orgSettings").first()
  if (!row) return ORG_DEFAULTS
  return {
    company: { ...ORG_DEFAULTS.company, ...row.company },
    documents: { ...ORG_DEFAULTS.documents, ...row.documents },
    training: { ...ORG_DEFAULTS.training, ...row.training },
    floor: { ...ORG_DEFAULTS.floor, ...row.floor },
  }
}

export const get = query({
  args: {},
  handler: async (ctx): Promise<OrgSettings> => {
    await requireUserId(ctx)
    return await readOrgSettings(ctx)
  },
})

function check(label: string, value: number, [min, max]: readonly [number, number]) {
  if (!Number.isFinite(value) || Math.round(value) !== value || value < min || value > max)
    throw new ConvexError(`${label} must be a whole number from ${min} to ${max}.`)
}

/**
 * Changes some company-wide defaults. Pass only the fields that change; the
 * rest stay as they are. Engineer or Admin, checked in.
 */
export const update = mutation({
  args: {
    personId: v.optional(v.id("people")),
    company: v.optional(
      v.object({
        documentLanguages: v.optional(v.array(v.union(v.literal("en"), v.literal("nl")))),
      }),
    ),
    documents: v.optional(
      v.object({
        reviewIntervalMonths: v.optional(v.number()),
        dueSoonDays: v.optional(v.number()),
        requireChangeNote: v.optional(v.boolean()),
        fourEyes: v.optional(v.boolean()),
      }),
    ),
    training: v.optional(
      v.object({
        passMark: v.optional(v.number()),
        dueDays: v.optional(v.number()),
        refreshMonths: v.optional(v.union(v.number(), v.null())),
        questionsPerObjective: v.optional(v.number()),
        tryOutForSafety: v.optional(v.boolean()),
        failsBeforeWalkthrough: v.optional(v.number()),
      }),
    ),
    floor: v.optional(
      v.object({
        checkInIdleMinutes: v.optional(v.number()),
        captureRetentionDays: v.optional(v.union(v.number(), v.null())),
        captureNotice: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer or Admin to change Settings.")
    const L = ORG_LIMITS

    const c = args.company
    if (c?.documentLanguages !== undefined) {
      const langs = [...new Set(c.documentLanguages)]
      if (langs.length === 0) throw new ConvexError("Keep at least one document language.")
      c.documentLanguages = langs
    }
    const d = args.documents
    if (d?.reviewIntervalMonths !== undefined) check("The review interval", d.reviewIntervalMonths, L.reviewIntervalMonths)
    if (d?.dueSoonDays !== undefined) check("The due-soon window", d.dueSoonDays, L.dueSoonDays)
    const t = args.training
    if (t?.passMark !== undefined) check("The pass mark", t.passMark, L.passMark)
    if (t?.dueDays !== undefined) check("The due days", t.dueDays, L.dueDays)
    if (t?.refreshMonths != null) check("The refresher period", t.refreshMonths, L.refreshMonths)
    if (t?.questionsPerObjective !== undefined) check("Questions per objective", t.questionsPerObjective, L.questionsPerObjective)
    if (t?.failsBeforeWalkthrough !== undefined) check("Fails before a walk-through", t.failsBeforeWalkthrough, L.failsBeforeWalkthrough)
    const f = args.floor
    if (f?.checkInIdleMinutes !== undefined) check("The check-in timeout", f.checkInIdleMinutes, L.checkInIdleMinutes)
    if (f?.captureRetentionDays != null) check("Media retention", f.captureRetentionDays, L.captureRetentionDays)
    if (f?.captureNotice !== undefined) {
      const text = f.captureNotice?.trim() ?? ""
      if (text.length > L.captureNoticeChars[1])
        throw new ConvexError(`Keep the Captures notice under ${L.captureNoticeChars[1]} characters.`)
      f.captureNotice = text || null
    }

    const row = await ctx.db.query("orgSettings").first()
    const next = {
      company: { ...row?.company, ...c },
      documents: { ...row?.documents, ...d },
      training: { ...row?.training, ...t },
      floor: { ...row?.floor, ...f },
      updatedAt: Date.now(),
      updatedBy: person._id,
    }
    if (row) await ctx.db.patch(row._id, next)
    else await ctx.db.insert("orgSettings", next)
    return await readOrgSettings(ctx)
  },
})
