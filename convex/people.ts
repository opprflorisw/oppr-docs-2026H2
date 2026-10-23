import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"

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
