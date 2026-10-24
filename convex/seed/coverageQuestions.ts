// Seed module: Coverage questions such as "Who can run line 2 tonight?". Filled in by its lane; called by seedKnowledge after
// people, assets, documents, Trainings and Skills exist.
import { internalMutation } from "../_generated/server"

export const run = internalMutation({
  args: {},
  handler: async () => {
    return { skipped: "not built yet" }
  },
})
