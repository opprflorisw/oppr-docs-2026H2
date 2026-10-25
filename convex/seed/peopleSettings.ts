// Seed module: shifts and skill level names (people lane). Called by seedKnowledge after the other modules.
// Running it again replaces what it made. No AI calls.
import { internalMutation } from "../_generated/server"
import { DEFAULT_SHIFTS } from "../people/shifts"
import { DEFAULT_LEVEL_NAMES } from "../people/levels"

// The plant manager looks after Settings: an Admin, who passes every Engineer
// check. Sanne Visser stays an Engineer.
const ADMIN = { name: "Ruud Kok", role: "Plant manager", email: "ruud.kok@pijpwerk-noord.example" }

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db.query("shifts").take(50)) await ctx.db.delete(row._id)
    for (const s of DEFAULT_SHIFTS) await ctx.db.insert("shifts", { ...s })

    for (const row of await ctx.db.query("skillLevelNames").take(10)) await ctx.db.delete(row._id)
    for (const [level, name] of DEFAULT_LEVEL_NAMES.entries()) await ctx.db.insert("skillLevelNames", { level, name })

    const people = await ctx.db.query("people").take(500)
    const existing = people.find((p) => p.name === ADMIN.name)
    if (existing) {
      await ctx.db.patch(existing._id, { kind: "admin", email: ADMIN.email, shift: existing.shift ?? "day" })
    } else {
      await ctx.db.insert("people", {
        name: ADMIN.name,
        kind: "admin",
        role: ADMIN.role,
        email: ADMIN.email,
        area: null,
        shift: "day",
        sortOrder: people.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1,
      })
    }
    return { shifts: DEFAULT_SHIFTS.length, levels: DEFAULT_LEVEL_NAMES.length, admin: ADMIN.name }
  },
})
