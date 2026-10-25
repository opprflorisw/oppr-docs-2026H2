// Coverage questions: the questions a shift lead asks every day, such as
// "Who can run line 2 tonight?". Each one is a Skill profile plus an
// optional shift. An Engineer manages them in Learn, Skills setup. The Skill
// matrix shows one button per question; Home shows the ones marked
// showOnHome as quick answers. The answer itself comes from skills.coverage.
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"
import { loadShifts } from "./people/shifts"

// A shift key from the shifts table (Settings, People and roles).
const shiftValidator = v.string()
const MAX_LABEL = 120

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = await ctx.db.query("coverageQuestions").withIndex("by_order").take(100)
    const shifts = new Set((await loadShifts(ctx)).map((s) => s.key))
    const out = []
    for (const q of rows) {
      const profile = await ctx.db.get(q.profileId)
      out.push({
        _id: q._id,
        label: q.label,
        profileId: q.profileId,
        profileName: profile?.name ?? null,
        shift: q.shift && shifts.has(q.shift) ? q.shift : null,
        order: q.order,
        showOnHome: q.showOnHome ?? false,
      })
    }
    return out
  },
})

async function engineerFor(ctx: MutationCtx, personId: Id<"people">) {
  await requireUserId(ctx)
  return await requireEngineerOrAdmin(ctx, personId, "Check in as an Engineer to change coverage questions.")
}

/** The shift key when it exists; null means every shift. */
async function checkShift(ctx: MutationCtx, shift: string | null | undefined) {
  if (!shift) return undefined
  if (!(await loadShifts(ctx)).some((s) => s.key === shift)) throw new Error("That shift no longer exists.")
  return shift
}

function cleanLabel(label: string) {
  const out = label.trim().replace(/\s+/g, " ")
  if (!out) throw new Error("Write the question, for example: Who can run line 2 tonight?")
  if (out.length > MAX_LABEL) throw new Error(`Keep the question under ${MAX_LABEL} characters.`)
  return out
}

async function checkProfile(ctx: MutationCtx, profileId: Id<"skillProfiles">) {
  if (!(await ctx.db.get(profileId))) throw new Error("That Skill profile no longer exists.")
}

export const create = mutation({
  args: {
    label: v.string(),
    profileId: v.id("skillProfiles"),
    shift: v.optional(v.union(shiftValidator, v.null())),
    showOnHome: v.optional(v.boolean()),
    engineerPersonId: v.id("people"),
  },
  handler: async (ctx, args) => {
    const engineer = await engineerFor(ctx, args.engineerPersonId)
    await checkProfile(ctx, args.profileId)
    const rows = await ctx.db.query("coverageQuestions").take(100)
    if (rows.length >= 20) throw new Error("There are already 20 coverage questions. Remove one first.")
    const order = rows.reduce((m, r) => Math.max(m, r.order), -1) + 1
    return await ctx.db.insert("coverageQuestions", {
      label: cleanLabel(args.label),
      profileId: args.profileId,
      shift: await checkShift(ctx, args.shift),
      order,
      showOnHome: args.showOnHome ?? false,
      createdBy: engineer._id,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("coverageQuestions"),
    label: v.optional(v.string()),
    profileId: v.optional(v.id("skillProfiles")),
    // null clears the shift: the question is about every shift.
    shift: v.optional(v.union(shiftValidator, v.null())),
    showOnHome: v.optional(v.boolean()),
    engineerPersonId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await engineerFor(ctx, args.engineerPersonId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("This coverage question no longer exists.")
    const patch: {
      label?: string
      profileId?: Id<"skillProfiles">
      shift?: string | undefined
      showOnHome?: boolean
    } = {}
    if (args.label !== undefined) patch.label = cleanLabel(args.label)
    if (args.profileId !== undefined) {
      await checkProfile(ctx, args.profileId)
      patch.profileId = args.profileId
    }
    if (args.shift !== undefined) patch.shift = await checkShift(ctx, args.shift)
    if (args.showOnHome !== undefined) patch.showOnHome = args.showOnHome
    await ctx.db.patch(row._id, patch)
  },
})

/** Saves a new order: ids from first to last. Ids not listed keep their place after them. */
export const reorder = mutation({
  args: { ids: v.array(v.id("coverageQuestions")), engineerPersonId: v.id("people") },
  handler: async (ctx, args) => {
    await engineerFor(ctx, args.engineerPersonId)
    const rows = await ctx.db.query("coverageQuestions").withIndex("by_order").take(100)
    const listed = new Set(args.ids)
    const ordered = [
      ...args.ids.flatMap((id) => rows.find((r) => r._id === id) ?? []),
      ...rows.filter((r) => !listed.has(r._id)),
    ]
    for (const [i, r] of ordered.entries()) if (r.order !== i) await ctx.db.patch(r._id, { order: i })
  },
})

export const remove = mutation({
  args: { id: v.id("coverageQuestions"), engineerPersonId: v.id("people") },
  handler: async (ctx, args) => {
    await engineerFor(ctx, args.engineerPersonId)
    const row = await ctx.db.get(args.id)
    if (row) await ctx.db.delete(row._id)
  },
})

/**
 * A person's shift and team, which coverage answers group people by. Set by
 * a checked-in Engineer in Settings, People. Without a shift, the shift is
 * read from the role text ("Line operator, late shift").
 */
export const setPersonShift = mutation({
  args: {
    personId: v.id("people"),
    shift: v.union(v.string(), v.null()),
    team: v.union(v.string(), v.null()),
    engineerPersonId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.engineerPersonId, "Check in as an Engineer to change someone's shift or team.")
    const person = await ctx.db.get(args.personId)
    if (!person) throw new Error("This person no longer exists.")
    const team = args.team?.trim().replace(/\s+/g, " ") || undefined
    if (team && team.length > 60) throw new Error("Keep the team name under 60 characters.")
    await ctx.db.patch(person._id, { shift: await checkShift(ctx, args.shift), team })
  },
})
