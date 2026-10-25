// The plant's own names for the four Skill levels (Settings, People and
// roles). The numbers 0-3 and what they mean stay fixed (CONTEXT.md: Skill);
// only the words change, for example to an ILUO scale.
import { ConvexError, v } from "convex/values"
import { mutation, query } from "../_generated/server"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { requireUser, requireUserId } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"

export const DEFAULT_LEVEL_NAMES = ["Not trained", "Knows it", "Can do it", "Can teach it"] as const

/** The four names, level 0 first. */
export async function loadLevelNames(ctx: QueryCtx | MutationCtx): Promise<string[]> {
  const rows = await ctx.db.query("skillLevelNames").withIndex("by_level").take(10)
  return DEFAULT_LEVEL_NAMES.map((d, level) => rows.find((r) => r.level === level)?.name || d)
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    return await loadLevelNames(ctx)
  },
})

/** Renames the levels; `names` holds four names, level 0 first. */
export const rename = mutation({
  args: { names: v.array(v.string()), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer or Admin to rename the Skill levels.")
    if (args.names.length !== 4) throw new ConvexError("Give a name for each of the four levels.")
    const names = args.names.map((n) => n.trim().replace(/\s+/g, " "))
    names.forEach((n, i) => {
      if (!n) throw new ConvexError(`Give level ${i} a name.`)
      if (n.length > 30) throw new ConvexError(`Keep the name of level ${i} under 30 characters.`)
    })
    if (new Set(names.map((n) => n.toLowerCase())).size < 4) throw new ConvexError("Give every level a different name.")
    const rows = await ctx.db.query("skillLevelNames").withIndex("by_level").take(10)
    for (const [level, name] of names.entries()) {
      const row = rows.find((r) => r.level === level)
      if (row) await ctx.db.patch(row._id, { name })
      else await ctx.db.insert("skillLevelNames", { level, name })
    }
  },
})
