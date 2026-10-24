import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineer } from "./documents"

// The showcase people (CONTEXT.md: Operator, Engineer). Checking in is a
// client-side choice of one of these; there is no login per person.
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const people = await ctx.db.query("people").take(200)
    return people.sort((a, b) => a.sortOrder - b.sortOrder)
  },
})

/**
 * The Skill profiles a person is measured against in the Skill matrix. Set by
 * a checked-in Engineer (engineerPersonId), like the rest of the catalogue.
 */
export const assignProfiles = mutation({
  args: {
    personId: v.id("people"),
    profileIds: v.array(v.id("skillProfiles")),
    engineerPersonId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.engineerPersonId)
    const person = await ctx.db.get(args.personId)
    if (!person) throw new Error("This person no longer exists.")
    const profileIds = []
    for (const id of new Set(args.profileIds)) {
      if (!(await ctx.db.get(id))) throw new Error("A Skill profile no longer exists.")
      profileIds.push(id)
    }
    await ctx.db.patch(person._id, { profileIds })
  },
})
