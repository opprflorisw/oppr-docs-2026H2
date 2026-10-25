// Seed module: shifts and skill level names (people lane). Called by seedKnowledge after the other modules.
// Running it again replaces what it made. No AI calls.
import { internalMutation } from "../_generated/server"

export const run = internalMutation({
  args: {},
  handler: async () => {
    return { todo: true }
  },
})
