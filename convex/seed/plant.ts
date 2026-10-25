// Seed module: the Plant ontology and organization background (plant lane). Called by seedKnowledge after the other modules.
// Running it again replaces what it made. No AI calls.
import { internalMutation } from "../_generated/server"

export const run = internalMutation({
  args: {},
  handler: async () => {
    return { todo: true }
  },
})
