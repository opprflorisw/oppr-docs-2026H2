// SCAFFOLD: seed entry point, owned by its track (see docs/build/full-showcase-plan.md).
// Called by seedKnowledge after documents, chunks, people and assets exist.
// Find what you need by naming code, asset code or person name; skip quietly
// when something is missing; return a small count object.
import { internalMutation } from "../_generated/server"

export const run = internalMutation({
  args: {},
  handler: async () => {
    return { skipped: true }
  },
})
