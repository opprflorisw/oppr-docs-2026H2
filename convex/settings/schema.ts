// Tables owned by the settings module. Spread into convex/schema.ts.
import { defineTable } from "convex/server"
import { v } from "convex/values"

// Company-wide defaults (Settings: Company, Documents, Training, Floor). One
// row. Every group and field is optional: a missing value means "use the
// default" (ORG_DEFAULTS in convex/orgSettings.ts), so a new default never
// needs a migration.
/** The four groups; also the args of orgSettings.update (pass only what changes). */
export const orgSettingsGroups = {
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
}

export const settingsTables = {
  orgSettings: defineTable({
    ...orgSettingsGroups,
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("people")),
  }),
}
