// Seed module: Captures and a combined Capture set (docs/adr/0005). Filled in by its lane; called by seedKnowledge after
// people, assets, documents, Trainings and Skills exist.
import { internalMutation } from "../_generated/server"

export const run = internalMutation({
  args: {},
  handler: async () => {
    return { skipped: "not built yet" }
  },
})
